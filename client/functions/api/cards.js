import { requireVerifiedSession } from "../_lib/session.js";

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeComments(comments) {
  if (!Array.isArray(comments)) return [];

  return comments
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 200)
    .map((item) => item.slice(0, 1000));
}

function validatePayload({
  title,
  description,
  priority,
  status,
  comments,
  channelId,
  ownerName,
  createdByName,
  rejectionReason,
  isApproved,
  isRejected,
}) {
  const allowedStatuses = ["todo", "inprogress", "testing", "done"];
  const allowedPriorities = ["High", "Medium", "Low"];

  if (!title) return "Title is required.";
  if (!channelId) return "channel_id is required.";
  if (!allowedStatuses.includes(status)) return "Invalid status.";
  if (!allowedPriorities.includes(priority)) return "Invalid priority.";
  if (isApproved && status !== "done") return "Approved cards must be in the Approval column.";
  if (isRejected && status !== "todo") return "Rejected cards must remain in Backlog.";

  if (title.length > 120) return "Title must be 120 characters or fewer.";
  if (description.length > 2000) return "Description must be 2000 characters or fewer.";
  if (ownerName.length > 80) return "Owner name must be 80 characters or fewer.";
  if (createdByName.length > 80) return "Creator name must be 80 characters or fewer.";
  if (rejectionReason.length > 500) return "Rejection reason must be 500 characters or fewer.";

  for (const comment of comments) {
    if (comment.length > 1000) {
      return "Each comment must be 1000 characters or fewer.";
    }
  }

  return "";
}

function parseComments(value) {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
}

function mapRow(row) {
  const ownerName = row.owner_name || row.owner || "Unassigned";

  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    status: row.status,
    owner: ownerName,
    owner_name: ownerName,
    owner_user_id: row.owner_user_id || "",
    created_by_name: row.created_by_name || "",
    created_by_user_id: row.created_by_user_id || "",
    priority: row.priority || "Medium",
    comments: parseComments(row.comments),
    is_approved: Boolean(row.is_approved),
    is_rejected: Boolean(row.is_rejected),
    rejection_reason: row.rejection_reason || "",
    rejected_at: row.rejected_at || "",
    channel_id: row.channel_id || "global",
    created_at: row.created_at,
  };
}

function getChannelIdFromUrl(request) {
  const url = new URL(request.url);
  return cleanText(url.searchParams.get("channel_id"), "global");
}

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const channelId = getChannelIdFromUrl(request);

    const result = await env.DB.prepare(`
      SELECT
        id,
        title,
        description,
        status,
        owner,
        owner_user_id,
        owner_name,
        created_by_user_id,
        created_by_name,
        priority,
        comments,
        is_approved,
        is_rejected,
        rejection_reason,
        rejected_at,
        channel_id,
        created_at
      FROM cards
      WHERE channel_id = ?
      ORDER BY id ASC
    `)
      .bind(channelId)
      .all();

    return Response.json({
      success: true,
      cards: (result.results || []).map(mapRow),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;

    const authResult = await requireVerifiedSession(request, env);
    if (authResult instanceof Response) {
      return authResult;
    }

    const session = authResult;
    const body = await request.json();

    const title = cleanText(body.title);
    const description = cleanText(body.description);
    const status = cleanText(body.status, "todo");
    const priority = cleanText(body.priority, "Medium");
    const comments = normalizeComments(body.comments);
    const channelId = cleanText(body.channel_id, "global");

    let isApproved = body.is_approved ? 1 : 0;
    let isRejected = body.is_rejected ? 1 : 0;
    let rejectionReason = cleanText(body.rejection_reason).slice(0, 500);
    let rejectedAt = cleanText(body.rejected_at) || null;

    if (isApproved) {
      isRejected = 0;
      rejectionReason = "";
      rejectedAt = null;
    }

    if (!isRejected) {
      rejectionReason = "";
      rejectedAt = null;
    } else if (!rejectedAt) {
      rejectedAt = new Date().toISOString();
    }

    const ownerUserId = cleanText(body.owner_user_id) || null;
    const ownerName = cleanText(body.owner_name || body.owner, "Unassigned");

    const createdByUserId = session.userId;
    const createdByName = session.displayName;

    const validationError = validatePayload({
      title,
      description,
      priority,
      status,
      comments,
      channelId,
      ownerName,
      createdByName,
      rejectionReason,
      isApproved,
      isRejected,
    });

    if (validationError) {
      return Response.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    const countRow = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM cards
      WHERE channel_id = ?
    `)
      .bind(channelId)
      .first();

    const cardCount = Number(countRow?.count || 0);
    if (cardCount >= 500) {
      return Response.json(
        {
          success: false,
          error: "This board has reached the maximum number of cards.",
        },
        { status: 429 }
      );
    }

    const minuteRateRow = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM cards
      WHERE channel_id = ?
        AND created_by_user_id = ?
        AND created_at >= datetime('now', '-1 minute')
    `)
      .bind(channelId, createdByUserId)
      .first();

    const minuteCount = Number(minuteRateRow?.count || 0);

    if (minuteCount >= 5) {
      return Response.json(
        {
          success: false,
          error: "Rate limit reached. Please wait a minute before creating more cards.",
        },
        { status: 429 }
      );
    }

    const dayRateRow = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM cards
      WHERE channel_id = ?
        AND created_by_user_id = ?
        AND created_at >= datetime('now', '-1 day')
    `)
      .bind(channelId, createdByUserId)
      .first();

    const dayCount = Number(dayRateRow?.count || 0);

    if (dayCount >= 100) {
      return Response.json(
        {
          success: false,
          error: "Daily card creation limit reached for this user.",
        },
        { status: 429 }
      );
    }

    const inserted = await env.DB.prepare(`
      INSERT INTO cards (
        title,
        description,
        status,
        owner,
        owner_user_id,
        owner_name,
        created_by_user_id,
        created_by_name,
        priority,
        comments,
        is_approved,
        is_rejected,
        rejection_reason,
        rejected_at,
        channel_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        title,
        description,
        status,
        ownerName,
        ownerUserId,
        ownerName,
        createdByUserId,
        createdByName,
        priority,
        JSON.stringify(comments),
        isApproved,
        isRejected,
        rejectionReason,
        rejectedAt,
        channelId
      )
      .run();

    const insertedId = inserted?.meta?.last_row_id;

    const row = await env.DB.prepare(`
      SELECT
        id,
        title,
        description,
        status,
        owner,
        owner_user_id,
        owner_name,
        created_by_user_id,
        created_by_name,
        priority,
        comments,
        is_approved,
        is_rejected,
        rejection_reason,
        rejected_at,
        channel_id,
        created_at
      FROM cards
      WHERE id = ? AND channel_id = ?
      LIMIT 1
    `)
      .bind(insertedId, channelId)
      .first();

    return Response.json({
      success: true,
      card: mapRow(row),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

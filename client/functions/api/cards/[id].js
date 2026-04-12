import { requireVerifiedSession } from "../../_lib/session.js";

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeComments(comments) {
  if (!Array.isArray(comments)) return [];

  return comments
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 200);
}

function normalizeNullableText(value, fallback = "") {
  const text = cleanText(value, fallback);
  return text || null;
}

function mapBoardStateRow(row, boardId = "global") {
  return {
    board_id: row?.board_id || boardId,
    version: Number(row?.version || 0),
    updated_at: row?.updated_at || "",
    updated_by_user_id: row?.updated_by_user_id || "",
    updated_by_name: row?.updated_by_name || "",
    last_action: row?.last_action || "",
  };
}

async function touchBoardState(env, boardId, userId, userName, lastAction = "updated the board") {
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO board_state (
      board_id,
      version,
      updated_at,
      updated_by_user_id,
      updated_by_name,
      last_action
    )
    VALUES (?, 1, ?, ?, ?, ?)
    ON CONFLICT(board_id) DO UPDATE SET
      version = board_state.version + 1,
      updated_at = excluded.updated_at,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_by_name = excluded.updated_by_name,
      last_action = excluded.last_action
  `)
    .bind(
      boardId,
      now,
      userId || null,
      userName || "",
      lastAction || "updated the board"
    )
    .run();

  const row = await env.DB.prepare(`
    SELECT
      board_id,
      version,
      updated_at,
      updated_by_user_id,
      updated_by_name,
      last_action
    FROM board_state
    WHERE board_id = ?
    LIMIT 1
  `)
    .bind(boardId)
    .first();

  return mapBoardStateRow(row, boardId);
}

function validatePayload({
  title,
  description,
  priority,
  status,
  comments,
  channelId,
  ownerName,
  rejectionReason,
}) {
  const allowedStatuses = ["todo", "inprogress", "testing", "done"];
  const allowedPriorities = ["High", "Medium", "Low"];

  if (!title) return "Title is required.";
  if (!channelId) return "channel_id is required.";
  if (!allowedStatuses.includes(status)) return "Invalid status.";
  if (!allowedPriorities.includes(priority)) return "Invalid priority.";

  if (title.length > 120) return "Title must be 120 characters or fewer.";
  if (description.length > 2000) return "Description must be 2000 characters or fewer.";
  if (ownerName.length > 80) return "Owner name must be 80 characters or fewer.";
  if (rejectionReason.length > 500) return "Rejection reason must be 500 characters or fewer.";

  for (const comment of comments) {
    if (comment.length > 1000) {
      return "Each comment must be 1000 characters or fewer.";
    }
  }

  return "";
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
    comments: (() => {
      try {
        return JSON.parse(row.comments || "[]");
      } catch {
        return [];
      }
    })(),
    is_approved: Boolean(row.is_approved),
    is_rejected: Boolean(row.is_rejected),
    rejection_reason: row.rejection_reason || "",
    rejected_at: row.rejected_at || "",
    channel_id: row.channel_id || "global",
    created_at: row.created_at,
  };
}

function determineUpdateAction(existingRow, nextValues) {
  if (!existingRow) return "updated the board";

  if (!existingRow.is_approved && nextValues.isApproved) return "approved a card";
  if (!existingRow.is_rejected && nextValues.isRejected) return "rejected a card";
  if (existingRow.is_rejected && !nextValues.isRejected) return "reopened a card";
  if (existingRow.status !== nextValues.status) return "updated the board";
  return "updated the board";
}

export async function onRequestPut(context) {
  try {
    const { env, request, params } = context;

    const authResult = await requireVerifiedSession(request, env);
    if (authResult instanceof Response) {
      return authResult;
    }

    const session = authResult;
    const id = Number(params.id);
    const body = await request.json();

    if (!Number.isInteger(id) || id <= 0) {
      return Response.json(
        { success: false, error: "Invalid card id." },
        { status: 400 }
      );
    }

    const title = cleanText(body.title);
    const description = cleanText(body.description);
    const status = cleanText(body.status);
    const priority = cleanText(body.priority, "Medium");
    const comments = normalizeComments(body.comments);
    const isApproved = body.is_approved ? 1 : 0;
    const isRejected = body.is_rejected ? 1 : 0;
    const rejectionReason = cleanText(body.rejection_reason).slice(0, 500);
    const rejectedAt = body.rejected_at ? cleanText(body.rejected_at) : null;
    const channelId = cleanText(body.channel_id, "global");

    const ownerUserId = normalizeNullableText(body.owner_user_id);
    const ownerName = cleanText(body.owner_name || body.owner, "Unassigned");

    const validationError = validatePayload({
      title,
      description,
      priority,
      status,
      comments,
      channelId,
      ownerName,
      rejectionReason,
    });

    if (validationError) {
      return Response.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    const existing = await env.DB.prepare(`
      SELECT
        id,
        status,
        is_approved,
        is_rejected
      FROM cards
      WHERE id = ? AND channel_id = ?
    `)
      .bind(id, channelId)
      .first();

    if (!existing) {
      return Response.json(
        { success: false, error: "Card not found in this channel." },
        { status: 404 }
      );
    }

    await env.DB.prepare(`
      UPDATE cards
      SET
        title = ?,
        description = ?,
        status = ?,
        owner = ?,
        owner_user_id = ?,
        owner_name = ?,
        priority = ?,
        comments = ?,
        is_approved = ?,
        is_rejected = ?,
        rejection_reason = ?,
        rejected_at = ?
      WHERE id = ? AND channel_id = ?
    `)
      .bind(
        title,
        description,
        status,
        ownerName,
        ownerUserId,
        ownerName,
        priority,
        JSON.stringify(comments),
        isApproved,
        isRejected,
        rejectionReason,
        rejectedAt,
        id,
        channelId
      )
      .run();

    const updated = await env.DB.prepare(`
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
    `)
      .bind(id, channelId)
      .first();

    const boardState = await touchBoardState(
      env,
      channelId,
      session.userId,
      session.displayName,
      determineUpdateAction(existing, { status, isApproved, isRejected })
    );

    return Response.json({
      success: true,
      card: mapRow(updated),
      board_state: boardState,
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

export async function onRequestDelete(context) {
  try {
    const { env, request, params } = context;

    const authResult = await requireVerifiedSession(request, env);
    if (authResult instanceof Response) {
      return authResult;
    }

    const session = authResult;
    const id = Number(params.id);
    const url = new URL(request.url);
    const channelId = cleanText(url.searchParams.get("channel_id"), "global");

    if (!Number.isInteger(id) || id <= 0) {
      return Response.json(
        { success: false, error: "Invalid card id." },
        { status: 400 }
      );
    }

    const existing = await env.DB.prepare(`
      SELECT id
      FROM cards
      WHERE id = ? AND channel_id = ?
    `)
      .bind(id, channelId)
      .first();

    if (!existing) {
      return Response.json(
        { success: false, error: "Card not found in this channel." },
        { status: 404 }
      );
    }

    await env.DB.prepare(`
      DELETE FROM cards
      WHERE id = ? AND channel_id = ?
    `)
      .bind(id, channelId)
      .run();

    const boardState = await touchBoardState(
      env,
      channelId,
      session.userId,
      session.displayName,
      "deleted a card"
    );

    return Response.json({
      success: true,
      board_state: boardState,
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

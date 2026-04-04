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

function validatePayload({
  title,
  description,
  priority,
  status,
  comments,
  channelId,
  ownerName,
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
    channel_id: row.channel_id || "global",
    created_at: row.created_at,
  };
}

export async function onRequestPut(context) {
  try {
    const { env, request, params } = context;
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
    const channelId = cleanText(body.channel_id, "global");

    const ownerUserId = cleanText(body.owner_user_id) || null;
    const ownerName = cleanText(body.owner_name || body.owner, "Unassigned");

    const validationError = validatePayload({
      title,
      description,
      priority,
      status,
      comments,
      channelId,
      ownerName,
    });

    if (validationError) {
      return Response.json(
        { success: false, error: validationError },
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
        is_approved = ?
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
        channel_id,
        created_at
      FROM cards
      WHERE id = ? AND channel_id = ?
    `)
      .bind(id, channelId)
      .first();

    return Response.json({
      success: true,
      card: mapRow(updated),
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

    return Response.json({ success: true });
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
function normalizeComments(comments) {
  if (Array.isArray(comments)) {
    return comments
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  return [];
}

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    status: row.status,
    owner: row.owner || "Unassigned",
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

function getChannelIdFromUrl(request) {
  const url = new URL(request.url);
  return (url.searchParams.get("channel_id") || "global").trim();
}

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const channelId = getChannelIdFromUrl(request);

    const result = await env.DB.prepare(`
      SELECT id, title, description, status, owner, priority, comments, is_approved, channel_id, created_at
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
    const body = await request.json();

    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    const status = (body.status || "todo").trim();
    const owner = (body.owner || "Unassigned").trim();
    const priority = (body.priority || "Medium").trim();
    const comments = normalizeComments(body.comments);
    const isApproved = body.is_approved ? 1 : 0;
    const channelId = (body.channel_id || "global").trim();

    const allowedStatuses = ["todo", "inprogress", "testing", "done"];
    const allowedPriorities = ["High", "Medium", "Low"];

    if (!title) {
      return Response.json(
        { success: false, error: "Title is required." },
        { status: 400 }
      );
    }

    if (!channelId) {
      return Response.json(
        { success: false, error: "channel_id is required." },
        { status: 400 }
      );
    }

    if (!allowedStatuses.includes(status)) {
      return Response.json(
        { success: false, error: "Invalid status." },
        { status: 400 }
      );
    }

    if (!allowedPriorities.includes(priority)) {
      return Response.json(
        { success: false, error: "Invalid priority." },
        { status: 400 }
      );
    }

    await env.DB.prepare(`
      INSERT INTO cards (title, description, status, owner, priority, comments, is_approved, channel_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        title,
        description,
        status,
        owner || "Unassigned",
        priority,
        JSON.stringify(comments),
        isApproved,
        channelId
      )
      .run();

    const row = await env.DB.prepare(`
      SELECT id, title, description, status, owner, priority, comments, is_approved, channel_id, created_at
      FROM cards
      WHERE channel_id = ?
      ORDER BY id DESC
      LIMIT 1
    `)
      .bind(channelId)
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
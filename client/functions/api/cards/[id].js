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

    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    const status = (body.status || "").trim();
    const owner = (body.owner || "Unassigned").trim();
    const priority = (body.priority || "Medium").trim();
    const comments = normalizeComments(body.comments);

    const allowedStatuses = ["todo", "inprogress", "testing", "done"];
    const allowedPriorities = ["High", "Medium", "Low"];

    if (!title) {
      return Response.json(
        { success: false, error: "Title is required." },
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

    const existing = await env.DB.prepare(`
      SELECT id
      FROM cards
      WHERE id = ?
    `)
      .bind(id)
      .first();

    if (!existing) {
      return Response.json(
        { success: false, error: "Card not found." },
        { status: 404 }
      );
    }

    await env.DB.prepare(`
      UPDATE cards
      SET title = ?, description = ?, status = ?, owner = ?, priority = ?, comments = ?
      WHERE id = ?
    `)
      .bind(
        title,
        description,
        status,
        owner || "Unassigned",
        priority,
        JSON.stringify(comments),
        id
      )
      .run();

    const updated = await env.DB.prepare(`
      SELECT id, title, description, status, owner, priority, comments, created_at
      FROM cards
      WHERE id = ?
    `)
      .bind(id)
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
    const { env, params } = context;
    const id = Number(params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return Response.json(
        { success: false, error: "Invalid card id." },
        { status: 400 }
      );
    }

    const existing = await env.DB.prepare(`
      SELECT id
      FROM cards
      WHERE id = ?
    `)
      .bind(id)
      .first();

    if (!existing) {
      return Response.json(
        { success: false, error: "Card not found." },
        { status: 404 }
      );
    }

    await env.DB.prepare(`
      DELETE FROM cards
      WHERE id = ?
    `)
      .bind(id)
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
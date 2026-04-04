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
    .slice(0, 200)
    .map((item) => item.slice(0, 1000));
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
    created_at: row.created_at || "",
  };
}

function sanitizeImportedCard(card) {
  const allowedStatuses = ["todo", "inprogress", "testing", "done"];
  const allowedPriorities = ["High", "Medium", "Low"];

  const title = cleanText(card?.title, "Imported Card").slice(0, 120);
  const description = cleanText(card?.description).slice(0, 2000);

  const status = allowedStatuses.includes(card?.status) ? card.status : "todo";
  const priority = allowedPriorities.includes(card?.priority)
    ? card.priority
    : "Medium";

  const ownerUserId = cleanText(card?.owner_user_id) || null;
  const ownerName = cleanText(card?.owner_name || card?.owner, "Unassigned").slice(0, 80);

  const createdByUserId = cleanText(card?.created_by_user_id) || null;
  const createdByName = cleanText(card?.created_by_name, ownerName === "Unassigned" ? "" : ownerName).slice(0, 80);

  const comments = normalizeComments(card?.comments);
  const isApproved = card?.is_approved ? 1 : 0;

  return {
    title,
    description,
    status,
    ownerName,
    ownerUserId,
    createdByName,
    createdByUserId,
    priority,
    comments,
    isApproved,
  };
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;

    const authResult = await requireVerifiedSession(request, env);
    if (authResult instanceof Response) {
      return authResult;
    }

    const body = await request.json();

    const channelId = cleanText(body.channel_id, "global");
    const replace = body.replace !== false;
    const inputCards = Array.isArray(body.cards) ? body.cards : null;

    if (!channelId) {
      return Response.json(
        { success: false, error: "channel_id is required." },
        { status: 400 }
      );
    }

    if (!inputCards) {
      return Response.json(
        { success: false, error: "cards array is required." },
        { status: 400 }
      );
    }

    const sanitizedCards = inputCards.slice(0, 500).map(sanitizeImportedCard);

    if (inputCards.length > 500) {
      return Response.json(
        {
          success: false,
          error: "Import file exceeds the maximum number of cards for one board.",
        },
        { status: 400 }
      );
    }

    if (replace) {
      await env.DB.prepare(`
        DELETE FROM cards
        WHERE channel_id = ?
      `)
        .bind(channelId)
        .run();
    } else {
      const countRow = await env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM cards
        WHERE channel_id = ?
      `)
        .bind(channelId)
        .first();

      const existingCount = Number(countRow?.count || 0);

      if (existingCount + sanitizedCards.length > 500) {
        return Response.json(
          {
            success: false,
            error: "Import would exceed the maximum number of cards for this board.",
          },
          { status: 429 }
        );
      }
    }

    if (sanitizedCards.length > 0) {
      const statements = sanitizedCards.map((card) =>
        env.DB.prepare(`
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
            channel_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          card.title,
          card.description,
          card.status,
          card.ownerName,
          card.ownerUserId,
          card.ownerName,
          card.createdByUserId,
          card.createdByName,
          card.priority,
          JSON.stringify(card.comments),
          card.isApproved,
          channelId
        )
      );

      await env.DB.batch(statements);
    }

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
      imported_count: sanitizedCards.length,
      cards: (result.results || []).map(mapRow),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Failed to import board.",
      },
      { status: 500 }
    );
  }
}
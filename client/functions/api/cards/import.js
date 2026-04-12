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
  const createdByName = cleanText(
    card?.created_by_name,
    ownerName === "Unassigned" ? "" : ownerName
  ).slice(0, 80);

  const comments = normalizeComments(card?.comments);
  const isApproved = card?.is_approved ? 1 : 0;
  const isRejected = card?.is_rejected ? 1 : 0;
  const rejectionReason = cleanText(card?.rejection_reason).slice(0, 500);
  const rejectedAt = card?.rejected_at ? cleanText(card?.rejected_at) : null;

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
    isRejected,
    rejectionReason,
    rejectedAt,
  };
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

    if (inputCards.length > 500) {
      return Response.json(
        {
          success: false,
          error: "Import file exceeds the maximum number of cards for one board.",
        },
        { status: 400 }
      );
    }

    const sanitizedCards = inputCards.slice(0, 500).map(sanitizeImportedCard);

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
            is_rejected,
            rejection_reason,
            rejected_at,
            channel_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          card.isRejected,
          card.rejectionReason,
          card.rejectedAt,
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

    const boardState = await touchBoardState(
      env,
      channelId,
      session.userId,
      session.displayName,
      "imported the board"
    );

    return Response.json({
      success: true,
      imported_count: sanitizedCards.length,
      cards: (result.results || []).map(mapRow),
      board_state: boardState,
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

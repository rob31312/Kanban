import { requireVerifiedSession } from "../../_lib/session.js";

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

export async function onRequestPost(context) {
  try {
    const { env, request } = context;

    const authResult = await requireVerifiedSession(request, env);
    if (authResult instanceof Response) {
      return authResult;
    }

    const session = authResult;
    const body = await request.json();

    const channelId = (body.channel_id || "").trim();

    if (!channelId) {
      return Response.json(
        { success: false, error: "channel_id is required." },
        { status: 400 }
      );
    }

    await env.DB.prepare(`
      DELETE FROM cards
      WHERE channel_id = ?
    `)
      .bind(channelId)
      .run();

    const boardState = await touchBoardState(
      env,
      channelId,
      session.userId,
      session.displayName,
      "reset the board"
    );

    return Response.json({
      success: true,
      board_state: boardState,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Failed to reset board.",
      },
      { status: 500 }
    );
  }
}

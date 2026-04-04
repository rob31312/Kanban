function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeParticipant(participant) {
  const source = participant?.user ? participant.user : participant;

  const discordUserId = cleanText(source?.id);
  if (!discordUserId) return null;

  const username = cleanText(source?.username) || null;
  const globalName = cleanText(source?.global_name) || null;
  const avatar = cleanText(source?.avatar) || null;

  return {
    discord_user_id: discordUserId,
    username,
    global_name: globalName,
    avatar,
  };
}

function mapMember(row) {
  const displayName =
    row.global_name ||
    row.username ||
    "User";

  return {
    id: row.id,
    board_id: row.board_id,
    discord_user_id: row.discord_user_id,
    username: row.username || "",
    global_name: row.global_name || "",
    avatar: row.avatar || "",
    display_name: displayName,
    is_current_participant: Boolean(row.is_current_participant),
    last_seen_at: row.last_seen_at,
  };
}

function getBoardIdFromUrl(request) {
  const url = new URL(request.url);
  return cleanText(url.searchParams.get("channel_id"), "global");
}

async function loadMembers(env, boardId) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      board_id,
      discord_user_id,
      username,
      global_name,
      avatar,
      is_current_participant,
      last_seen_at
    FROM board_members
    WHERE board_id = ?
    ORDER BY is_current_participant DESC, COALESCE(global_name, username) COLLATE NOCASE ASC
  `)
    .bind(boardId)
    .all();

  return (result.results || []).map(mapMember);
}

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const boardId = getBoardIdFromUrl(request);

    return Response.json({
      success: true,
      members: await loadMembers(env, boardId),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Failed to load board members.",
      },
      { status: 500 }
    );
  }
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();

    const boardId = cleanText(body.channel_id, "global");
    const participants = Array.isArray(body.participants) ? body.participants : [];

    if (!boardId) {
      return Response.json(
        { success: false, error: "channel_id is required." },
        { status: 400 }
      );
    }

    const normalized = participants
      .map(normalizeParticipant)
      .filter(Boolean);

    await env.DB.prepare(`
      UPDATE board_members
      SET is_current_participant = 0
      WHERE board_id = ?
    `)
      .bind(boardId)
      .run();

    const now = new Date().toISOString();

    for (const member of normalized) {
      await env.DB.prepare(`
        INSERT INTO board_members (
          board_id,
          discord_user_id,
          username,
          global_name,
          avatar,
          is_current_participant,
          last_seen_at
        )
        VALUES (?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(board_id, discord_user_id) DO UPDATE SET
          username = excluded.username,
          global_name = excluded.global_name,
          avatar = excluded.avatar,
          is_current_participant = 1,
          last_seen_at = excluded.last_seen_at
      `)
        .bind(
          boardId,
          member.discord_user_id,
          member.username,
          member.global_name,
          member.avatar,
          now
        )
        .run();
    }

    return Response.json({
      success: true,
      members: await loadMembers(env, boardId),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Failed to sync board members.",
      },
      { status: 500 }
    );
  }
}
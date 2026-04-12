function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
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

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const channelId = cleanText(url.searchParams.get("channel_id"), "global");

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
      .bind(channelId)
      .first();

    return Response.json({
      success: true,
      board_state: mapBoardStateRow(row, channelId),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Failed to load board state.",
      },
      { status: 500 }
    );
  }
}

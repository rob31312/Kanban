import { requireVerifiedSession } from "../../_lib/session.js";

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
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
    created_at: row.created_at || "",
  };
}

export async function onRequestGet(context) {
  try {
    const { env, request } = context;

    const authResult = await requireVerifiedSession(request, env);
    if (authResult instanceof Response) {
      return authResult;
    }

    const url = new URL(request.url);
    const channelId = cleanText(url.searchParams.get("channel_id"), "global");

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

    const cards = (result.results || []).map(mapRow);

    const payload = {
      success: true,
      export_version: 2,
      exported_at: new Date().toISOString(),
      channel_id: channelId,
      card_count: cards.length,
      cards,
    };

    const safeChannel = channelId.replace(/[^a-zA-Z0-9_-]/g, "_") || "global";
    const filename = `kanban-board-${safeChannel}.json`;

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Failed to export board file.",
      },
      { status: 500 }
    );
  }
}

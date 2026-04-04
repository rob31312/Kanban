import { requireVerifiedSession } from "../_lib/session.js";

export async function onRequestPost(context) {
  try {
    const { env, request } = context;

    const authResult = await requireVerifiedSession(request, env);
    if (authResult instanceof Response) {
      return authResult;
    }

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

    return Response.json({
      success: true,
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
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();

    const code = (body.code || "").trim();

    if (!code) {
      return Response.json(
        { success: false, error: "Missing authorization code." },
        { status: 400 }
      );
    }

    const clientId = env.VITE_DISCORD_CLIENT_ID;
    const clientSecret = env.DISCORD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return Response.json(
        { success: false, error: "Missing Discord OAuth configuration." },
        { status: 500 }
      );
    }

    const formData = new URLSearchParams();
    formData.set("client_id", clientId);
    formData.set("client_secret", clientSecret);
    formData.set("grant_type", "authorization_code");
    formData.set("code", code);
    formData.set("redirect_uri", "https://127.0.0.1");

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return Response.json(
        {
          success: false,
          error: tokenData.error_description || tokenData.error || "Token exchange failed.",
          details: tokenData,
        },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Unknown token exchange error.",
      },
      { status: 500 }
    );
  }
}
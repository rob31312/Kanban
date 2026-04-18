const DISCORD_API_BASE = "https://discord.com/api/v10";
const SESSION_COOKIE_NAME = "discord_activity_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const DEFAULT_REDIRECT_URI = "https://127.0.0.1";

const textEncoder = new TextEncoder();

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

    const clientId = env.VITE_DISCORD_CLIENT_ID || env.DISCORD_CLIENT_ID;
    const clientSecret = env.DISCORD_CLIENT_SECRET;
    const sessionSecret = env.DISCORD_SESSION_SECRET;
    const redirectUri =
      env.DISCORD_REDIRECT_URI || body.redirect_uri || DEFAULT_REDIRECT_URI;

    if (!clientId || !clientSecret || !sessionSecret) {
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
    formData.set("redirect_uri", redirectUri);

    const tokenResponse = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const tokenData = await safeJson(tokenResponse);

    if (!tokenResponse.ok || !tokenData?.access_token) {
      return Response.json(
        {
          success: false,
          error:
            tokenData?.error_description ||
            tokenData?.error ||
            "Token exchange failed.",
          details: tokenData,
        },
        { status: 400 }
      );
    }

    const meResponse = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const me = await safeJson(meResponse);

    if (!meResponse.ok || !me?.id) {
      return Response.json(
        {
          success: false,
          error:
            "Discord user verification failed. Ensure your authorize() flow includes the identify scope.",
          details: me,
        },
        { status: 401 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const sessionPayload = {
      sub: String(me.id),
      username: me.username ?? null,
      global_name: me.global_name ?? null,
      discriminator: me.discriminator ?? null,
      avatar: me.avatar ?? null,
      issued_at: now,
      expires_at: now + SESSION_TTL_SECONDS,
    };

    const sessionToken = await mintSignedSession(sessionPayload, sessionSecret);

    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });

    headers.append("Set-Cookie", buildSessionCookie(request.url, sessionToken));

    return new Response(
      JSON.stringify({
        success: true,
        access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        scope: tokenData.scope,
        session_expires_at: sessionPayload.expires_at,
        user: {
          id: sessionPayload.sub,
          username: sessionPayload.username,
          global_name: sessionPayload.global_name,
          discriminator: sessionPayload.discriminator,
          avatar: sessionPayload.avatar,
        },
      }),
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Unknown token exchange error.",
      },
      { status: 500 }
    );
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function mintSignedSession(payloadObject, secret) {
  const payload = base64UrlEncodeString(JSON.stringify(payloadObject));
  const signature = await signHmacSha256(payload, secret);
  return `${payload}.${signature}`;
}

async function signHmacSha256(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(message)
  );

  return base64UrlEncodeBytes(new Uint8Array(signatureBuffer));
}

function buildSessionCookie(requestUrl, token) {
  const url = new URL(requestUrl);
  const isLocal =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";

  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];

  if (isLocal) {
    parts.push("SameSite=Lax");
  } else {
    parts.push("SameSite=None");
    parts.push("Secure");
  }

  return parts.join("; ");
}

function base64UrlEncodeString(value) {
  return base64UrlEncodeBytes(textEncoder.encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
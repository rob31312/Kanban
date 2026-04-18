const SESSION_COOKIE_NAME = 'discord_activity_session';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function getVerifiedSession(request, env) {
  const sessionSecret = env.DISCORD_SESSION_SECRET;

  if (!sessionSecret) {
    throw new Error('Missing DISCORD_SESSION_SECRET configuration.');
  }

  const cookieHeader = request.headers.get('Cookie') || '';
  const token = getCookieValue(cookieHeader, SESSION_COOKIE_NAME);

  if (!token) {
    return null;
  }

  const session = await verifySignedSessionToken(token, sessionSecret);

  if (!session) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  if (!session.expires_at || now >= Number(session.expires_at)) {
    return null;
  }

  if (!session.sub) {
    return null;
  }

  return {
    userId: String(session.sub),
    username: session.username || '',
    globalName: session.global_name || '',
    discriminator: session.discriminator || '',
    avatar: session.avatar || '',
    issuedAt: Number(session.issued_at || 0),
    expiresAt: Number(session.expires_at || 0),
    displayName: getDisplayName(session),
  };
}

export async function requireVerifiedSession(request, env) {
  const session = await getVerifiedSession(request, env);

  if (!session) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Authentication required.',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  return session;
}

export function getActorFromSession(session) {
  if (!session) {
    return {
      actorId: '',
      actorName: 'User',
    };
  }

  return {
    actorId: session.userId,
    actorName: session.displayName || 'User',
  };
}

function getDisplayName(user) {
  if (!user) return 'User';

  if (user.global_name && String(user.global_name).trim()) {
    return String(user.global_name).trim();
  }

  if (
    user.username &&
    user.discriminator &&
    String(user.discriminator) !== '0'
  ) {
    return `${user.username}#${user.discriminator}`;
  }

  if (user.username && String(user.username).trim()) {
    return String(user.username).trim();
  }

  return 'User';
}

function getCookieValue(cookieHeader, name) {
  const parts = cookieHeader.split(';');

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;

    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();

    if (key === name) {
      return value;
    }
  }

  return '';
}

async function verifySignedSessionToken(token, secret) {
  const dotIndex = token.lastIndexOf('.');

  if (dotIndex <= 0) {
    return null;
  }

  const payload = token.slice(0, dotIndex);
  const providedSignature = token.slice(dotIndex + 1);

  if (!payload || !providedSignature) {
    return null;
  }

  const expectedSignature = await signHmacSha256(payload, secret);

  if (!timingSafeEqual(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const json = base64UrlDecodeToString(payload);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function signHmacSha256(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(message)
  );

  return base64UrlEncodeBytes(new Uint8Array(signatureBuffer));
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  let mismatch = 0;

  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}

function base64UrlDecodeToString(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const normalized = padded + '='.repeat(padLength);
  const binary = atob(normalized);

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return textDecoder.decode(bytes);
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
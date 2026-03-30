import { DiscordSDK } from '@discord/embedded-app-sdk';

let discordSdk = null;

function getDisplayName(user) {
  if (!user) return 'User';

  if (user.global_name && user.global_name.trim()) {
    return user.global_name.trim();
  }

  if (user.username && user.discriminator && user.discriminator !== '0') {
    return `${user.username}#${user.discriminator}`;
  }

  if (user.username && user.username.trim()) {
    return user.username.trim();
  }

  return 'User';
}

async function exchangeCodeForToken(code) {
  const response = await fetch('/api/discord/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Discord token exchange failed.');
  }

  return data.access_token;
}

export async function initializeDiscord() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

  if (!clientId) {
    return {
      enabled: false,
      message: 'Discord SDK not initialized because VITE_DISCORD_CLIENT_ID is missing.',
      channelId: 'global',
      displayName: 'User',
    };
  }

  try {
    discordSdk = new DiscordSDK(clientId);
    await discordSdk.ready();

    let displayName = 'User';

    try {
      const authorizeResult = await discordSdk.commands.authorize({
        client_id: clientId,
        response_type: 'code',
        prompt: 'none',
        scope: ['identify'],
        state: '',
      });

      if (authorizeResult?.code) {
        const accessToken = await exchangeCodeForToken(authorizeResult.code);

        const auth = await discordSdk.commands.authenticate({
          access_token: accessToken,
        });

        displayName = getDisplayName(auth?.user);
      }
    } catch (authError) {
      console.warn('Discord user auth did not complete, falling back to generic user name.', authError);
    }

    return {
      enabled: true,
      message: 'Connected to Discord Activity environment.',
      channelId: discordSdk.channelId || 'global',
      displayName,
    };
  } catch (error) {
    return {
      enabled: false,
      message: 'Running outside Discord or Discord SDK failed to initialize.',
      error,
      channelId: 'global',
      displayName: 'User',
    };
  }
}

export function getDiscordSdk() {
  return discordSdk;
}
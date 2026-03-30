import { DiscordSDK } from '@discord/embedded-app-sdk';

let discordSdk = null;

export async function initializeDiscord() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

  if (!clientId) {
    return {
      enabled: false,
      message: 'Discord SDK not initialized because VITE_DISCORD_CLIENT_ID is missing.',
      channelId: 'global',
    };
  }

  try {
    discordSdk = new DiscordSDK(clientId);
    await discordSdk.ready();

    return {
      enabled: true,
      message: 'Connected to Discord Activity environment.',
      channelId: discordSdk.channelId || 'global',
    };
  } catch (error) {
    return {
      enabled: false,
      message: 'Running outside Discord or Discord SDK failed to initialize.',
      error,
      channelId: 'global',
    };
  }
}

export function getDiscordSdk() {
  return discordSdk;
}
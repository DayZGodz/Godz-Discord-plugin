// Godz Discord Plugin - Open Link Action
// Reads last message from a text channel and opens the URL in browser
// Uses Discord Bot Token + REST API (primary) or RPC MESSAGE_CREATE (fallback)
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';

// Cache guild icons
const _iconCache = new Map();

async function fetchGuildIcon(rpc, guildId) {
  if (!guildId) return null;
  if (_iconCache.has(guildId)) return _iconCache.get(guildId);
  try {
    const guild = await rpc.request('GET_GUILD', { guild_id: guildId });
    const iconUrl = guild.data?.icon_url;
    if (!iconUrl) return null;
    const resp = await fetch(iconUrl);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    const mime = resp.headers.get('content-type') || 'image/png';
    const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
    _iconCache.set(guildId, dataUri);
    return dataUri;
  } catch (err) {
    logger.error('OpenLink: failed to fetch guild icon:', err.message);
    return null;
  }
}

// URL regex to extract links from message content
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

function extractUrl(msg) {
  // Check embeds first (they often have URLs)
  if (msg.embeds && msg.embeds.length > 0) {
    for (const embed of msg.embeds) {
      if (embed.url) return embed.url;
    }
  }
  // Check message content for URLs
  if (msg.content) {
    const urls = msg.content.match(URL_REGEX);
    if (urls && urls.length > 0) return urls[0];
  }
  return null;
}

// Fetch messages via Discord REST API using Bot token
async function fetchMessagesViaBot(botToken, channelId, limit = 10) {
  const url = `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages?limit=${limit}`;
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bot ${botToken}`,
      'Content-Type': 'application/json'
    }
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Discord API ${resp.status}: ${text}`);
  }
  return resp.json();
}

export class OpenLinkAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.openLink');
    this._lastUrl = new Map(); // context -> last found URL
  }

  onWillAppear({ context, payload }) {
    super.onWillAppear({ context, payload });
    this._updateDisplay(context);
  }

  onWillDisappear({ context }) {
    super.onWillDisappear({ context });
    this._lastUrl.delete(context);
  }

  didReceiveSettings({ context, payload }) {
    super.didReceiveSettings({ context, payload });
    _iconCache.delete(payload?.settings?.guildId);
    this._updateDisplay(context);
  }

  async _updateDisplay(context) {
    const settings = this.getSettings(context);

    // Set guild icon as background
    if (settings.guildId) {
      try {
        const icon = await fetchGuildIcon(this.rpc, settings.guildId);
        if (icon) this.setImage(context, icon);
      } catch { /* ignore */ }
    }

    // Set channel name as title (rendered at bottom by StreamDock)
    if (settings.channelName) {
      this.sdk.setTitle(context, settings.channelName, 3, 10);
    }
  }

  _getBotToken() {
    return this.sdk.globalSettings?.botToken || '';
  }

  async _fetchLastLink(context) {
    const settings = this.getSettings(context);
    if (!settings.channelId) return;

    const botToken = this._getBotToken();
    if (!botToken) {
      logger.warn('OpenLink: no bot token configured');
      return;
    }

    try {
      const messages = await fetchMessagesViaBot(botToken, settings.channelId, 20);
      logger.info('OpenLink: got', messages.length, 'messages via Bot API');

      // Messages are newest first — find the first one with a URL
      for (const msg of messages) {
        const url = extractUrl(msg);
        if (url) {
          this._lastUrl.set(context, url);
          logger.info('OpenLink: found URL:', url);
          return;
        }
      }

      logger.info('OpenLink: no URLs found in', messages.length, 'messages');
    } catch (err) {
      logger.error('OpenLink: Bot API failed:', err.message);
    }
  }

  async onKeyDown({ context }) {
    const settings = this.getSettings(context);
    if (!settings.channelId) { this.showAlert(context); return; }

    const botToken = this._getBotToken();
    if (!botToken) {
      logger.warn('OpenLink: no bot token — configure in Property Inspector');
      this.showAlert(context);
      return;
    }

    // Always re-fetch latest messages on key press
    await this._fetchLastLink(context);

    const url = this._lastUrl.get(context);
    if (url) {
      this.sdk.openUrl(url);
      this.showOk(context);
      logger.info('OpenLink: opened', url);
    } else {
      logger.warn('OpenLink: no URL found');
      this.showAlert(context);
    }
  }

  async onPropertyInspectorAppear({ context }) {
    await this._sendInitialPIData(context);
  }

  async _sendInitialPIData(context) {
    if (!this.isReady()) {
      this.sendToPI(context, {
        command: 'status',
        data: { connected: this.rpc.connected, authenticated: this.rpc.authenticated }
      });
      return;
    }

    try {
      const guilds = await this.rpc.getGuilds();

      // Enrich guilds with icon_url
      const enrichedGuilds = [];
      for (const g of guilds) {
        const enriched = { ...g };
        if (!enriched.icon_url) {
          try {
            const detail = await this.rpc.request('GET_GUILD', { guild_id: g.id });
            if (detail.data?.icon_url) enriched.icon_url = detail.data.icon_url;
          } catch { /* ignore */ }
        }
        enrichedGuilds.push(enriched);
      }

      this.sendToPI(context, { command: 'guilds', data: enrichedGuilds });

      const guildChannels = {};
      for (const guild of guilds) {
        try {
          const channels = await this.rpc.getChannels(guild.id);
          // Text channels = type 0
          guildChannels[guild.id] = channels.filter(c => c.type === 0);
        } catch {
          guildChannels[guild.id] = [];
        }
      }
      this.sendToPI(context, { command: 'guildChannels', data: guildChannels });

      const settings = this.getSettings(context);
      if (settings && settings.guildId) {
        const textChannels = guildChannels[settings.guildId] || [];
        this.sendToPI(context, { command: 'channels', data: textChannels });
      }

      this.sendToPI(context, {
        command: 'status',
        data: { connected: true, authenticated: true }
      });
    } catch (err) {
      logger.error('OpenLink: failed to send initial PI data:', err.message);
      this.sendToPI(context, { command: 'error', data: err.message });
    }
  }

  async onSendToPlugin({ context, payload }) {
    if (!this.isReady()) {
      this.sendToPI(context, {
        command: 'status',
        data: { connected: this.rpc.connected, authenticated: this.rpc.authenticated }
      });
      return;
    }

    switch (payload?.command) {
      case 'getGuilds': {
        try {
          const guilds = await this.rpc.getGuilds();
          this.sendToPI(context, { command: 'guilds', data: guilds });
        } catch (err) {
          this.sendToPI(context, { command: 'error', data: err.message });
        }
        break;
      }
      case 'getChannels': {
        try {
          const channels = await this.rpc.getChannels(payload.guildId);
          const textChannels = channels.filter(c => c.type === 0);
          this.sendToPI(context, { command: 'channels', data: textChannels });
        } catch (err) {
          this.sendToPI(context, { command: 'error', data: err.message });
        }
        break;
      }
    }
  }
}

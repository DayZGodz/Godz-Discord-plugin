// Godz Discord Plugin - Text Channel Action
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';

// Simple in-memory cache for guild icons
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
    logger.error('TextChannel: failed to fetch guild icon:', err.message);
    return null;
  }
}

export class TextChannelAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.textchannel');
  }

  onWillAppear({ context, payload }) {
    super.onWillAppear({ context, payload });
    this._updateDisplay(context);
  }

  didReceiveSettings({ context, payload }) {
    super.didReceiveSettings({ context, payload });
    const settings = payload?.settings || {};
    if (settings.guildId) {
      _iconCache.delete(settings.guildId);
    }
    this._updateDisplay(context);
  }

  async _updateDisplay(context) {
    const settings = this.getSettings(context);

    // Set guild icon as background image
    if (settings.guildId) {
      try {
        const icon = await fetchGuildIcon(this.rpc, settings.guildId);
        if (icon) this.setImage(context, icon);
      } catch { /* ignore */ }
    }

    // Set channel name as title (rendered on top of image by StreamDock)
    if (settings.channelName) {
      this.sdk.setTitle(context, settings.channelName, 3, 10);
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

      // Enrich guilds with icon_url for PI to display on LCD
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
      logger.error('Failed to send initial PI text data:', err.message);
      this.sendToPI(context, { command: 'error', data: err.message });
    }
  }

  async onKeyDown({ context }) {
    if (!this.isReady()) { this.showAlert(context); return; }
    const settings = this.getSettings(context);

    if (!settings.channelId) { this.showAlert(context); return; }

    try {
      // Always navigate to the channel first
      await this.rpc.selectTextChannel(settings.channelId);
      logger.info('SELECT_TEXT_CHANNEL sent:', settings.channelId);

      // If message + webhook are configured, send the message via webhook
      const messageText = (settings.messageText || '').trim();
      const webhookUrl = (settings.webhookUrl || '').trim();

      if (messageText && webhookUrl) {
        const msgResult = await this._sendViaWebhook(webhookUrl, messageText);
        if (msgResult.ok) {
          logger.info('Message sent via webhook');
          this.showOk(context);
        } else {
          logger.error('Webhook message failed:', msgResult.error);
          this.showAlert(context);
        }
        return;
      }

      this.showOk(context);
    } catch (err) {
      logger.error('Text channel action failed:', err.message);
      this.showAlert(context);
    }
  }

  async _sendViaWebhook(webhookUrl, message) {
    // Validate that the URL is a Discord webhook URL
    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return { ok: false, error: 'Invalid webhook URL' };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message })
      });

      if (response.ok || response.status === 204) {
        return { ok: true };
      }

      const errText = await response.text();
      return { ok: false, error: `HTTP ${response.status}: ${errText}` };
    } catch (err) {
      return { ok: false, error: err.message };
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
          this.sendToPI(context, { command: 'guilds', data: guilds || [] });
        } catch (err) {
          this.sendToPI(context, { command: 'error', data: err.message });
        }
        break;
      }
      case 'getChannels': {
        try {
          const channels = await this.rpc.getChannels(payload.guildId);
          const textChannels = (channels || []).filter(c => c.type === 0);
          this.sendToPI(context, { command: 'channels', data: textChannels });
        } catch (err) {
          this.sendToPI(context, { command: 'error', data: err.message });
        }
        break;
      }
    }
  }
}

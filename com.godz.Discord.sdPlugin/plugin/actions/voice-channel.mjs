// Busca usuários conectados em um canal de voz usando o token do bot
async function fetchVoiceChannelMembers(botToken, guildId, channelId) {
  const url = `https://discord.com/api/v10/guilds/${guildId}/voice-states`;
  try {
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error('[VoiceChannel] Discord API error:', resp.status, text);
      return { error: `API ${resp.status}` };
    }
    const voiceStates = await resp.json();
    console.log('[VoiceChannel] voiceStates:', voiceStates);
    const usersInChannel = voiceStates.filter(vs => vs.channel_id === channelId);
    if (!usersInChannel.length) {
      console.warn('[VoiceChannel] Nenhum usuário encontrado no canal:', channelId);
      return [];
    }
    const users = [];
    for (const vs of usersInChannel) {
      try {
        const userResp = await fetch(`https://discord.com/api/v10/users/${vs.user_id}`, {
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
          }
        });
        if (!userResp.ok) {
          console.warn('[VoiceChannel] Falha ao buscar perfil do usuário:', vs.user_id, userResp.status);
          users.push({
            id: vs.user_id,
            username: `ID:${vs.user_id}`,
            avatar: null,
            speaking: false
          });
          continue;
        }
        const user = await userResp.json();
        users.push({
          id: user.id,
          username: user.global_name || user.username || `ID:${user.id}`,
          avatar: user.avatar,
          speaking: false
        });
      } catch (err) {
        console.error('[VoiceChannel] Erro ao buscar perfil do usuário:', vs.user_id, err);
        users.push({
          id: vs.user_id,
          username: `ID:${vs.user_id}`,
          avatar: null,
          speaking: false
        });
      }
    }
    return users;
  } catch (err) {
    console.error('[VoiceChannel] Erro geral ao buscar membros:', err);
    return { error: 'API' };
  }
}
// Godz Discord Plugin - Voice Channel Action
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
    logger.error('Failed to fetch guild icon:', err.message);
    return null;
  }
}

export class VoiceChannelAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.voicechannel');
    this._currentChannelId = null;
    this._voiceUsers = [];
    this._avatarIndex = 0;
    this._avatarTimer = null;
    this._lastChannelId = null;

    rpc.on('VOICE_CHANNEL_SELECT', (msg) => {
      this._currentChannelId = msg.data?.channel_id || null;
      this._fetchVoiceUsers();
      this.updateAllContexts();
    });
  }

    async _fetchVoiceUsers() {
      try {
        const channel = await this.rpc.getSelectedVoiceChannel();
        if (channel && Array.isArray(channel.voice_states)) {
          this._voiceUsers = channel.voice_states.map(vs => ({
            id: vs.user?.id,
            username: vs.user?.username,
            avatar: vs.user?.avatar,
            nickname: vs.nick,
            speaking: false
          }));
          this._lastError = null;
        } else {
          this._voiceUsers = [];
          this._lastError = 'Nenhum usuário encontrado no canal.';
        }
      } catch (err) {
        this._voiceUsers = [];
        this._lastError = 'Erro ao buscar membros do canal.';
      }
    }

  _startAvatarRotation(context) {
    this._lastContext = context;
    if (this._avatarTimer) clearInterval(this._avatarTimer);
    this._avatarIndex = 0;
    // Marquee state
    let marqueeIndex = 0;
    let marqueeUserIndex = 0;
    let marqueeName = '';
    let marqueeTimer = null;

    const updateMarquee = async () => {
      await this._fetchVoiceUsers();
      if (this._lastError) {
        this.setTitle(context, this._lastError);
        this.setImage(context, null);
        return;
      }
      if (!this._voiceUsers.length) {
        this.setTitle(context, 'Sem usuários');
        this.setImage(context, null);
        return;
      }
      const user = this._voiceUsers[marqueeUserIndex % this._voiceUsers.length];
      // Nome sempre definido
      marqueeName = user.nickname || user.username || 'Usuário';
      // Espaço extra para looping visual
      const pad = '   ';
      let fullName = marqueeName + pad;
      // Tamanho máximo visível
      const maxLen = 13;
      let displayName = '';
      if (fullName.length <= maxLen) {
        displayName = fullName;
      } else {
        // Rolagem
        displayName = fullName.substring(marqueeIndex, marqueeIndex + maxLen);
        marqueeIndex = (marqueeIndex + 1) % fullName.length;
      }
      this.setTitle(context, displayName);
      // Avatar: mantém o último válido se falhar
      if (!this._lastAvatars) this._lastAvatars = {};
      if (user.avatar) {
        const avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
        try {
          const resp = await fetch(avatarUrl);
          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            const mime = resp.headers.get('content-type') || 'image/png';
            const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
            this.setImage(context, dataUri);
            this._lastAvatars[context] = dataUri;
          } else if (this._lastAvatars[context]) {
            this.setImage(context, this._lastAvatars[context]);
          }
        } catch (err) {
          logger.error('Erro ao baixar avatar:', err.message);
          if (this._lastAvatars[context]) {
            this.setImage(context, this._lastAvatars[context]);
          }
        }
      } else if (this._lastAvatars[context]) {
        this.setImage(context, this._lastAvatars[context]);
      }
    };

    // Troca de usuário a cada 5s, rolagem do nome a cada 400ms
    if (this._avatarTimer) clearInterval(this._avatarTimer);
    if (this._marqueeTimer) clearInterval(this._marqueeTimer);
    marqueeIndex = 0;
    marqueeUserIndex = 0;
    updateMarquee();
    this._marqueeTimer = setInterval(() => {
      updateMarquee();
    }, 600);
    this._avatarTimer = setInterval(() => {
      marqueeUserIndex = (marqueeUserIndex + 1) % (this._voiceUsers.length || 1);
      marqueeIndex = 0;
      updateMarquee();
    }, 6000);
  }

  _stopAvatarRotation() {
    if (this._avatarTimer) {
      clearInterval(this._avatarTimer);
      this._avatarTimer = null;
    }
    if (this._marqueeTimer) {
      clearInterval(this._marqueeTimer);
      this._marqueeTimer = null;
    }
  }

  async _setDefaultIcon(context) {
    const settings = this.getSettings(context);
    if (settings.guildId) {
      try {
        const icon = await fetchGuildIcon(this.rpc, settings.guildId);
        if (icon) this.setImage(context, icon);
      } catch {}
    }
    if (settings.channelName) {
      this.sdk.setTitle(context, settings.channelName, 3, 10);
    }
  }

  async onKeyDown({ context }) {
    if (!this.isReady()) { this.showAlert(context); return; }
    const settings = this.getSettings(context);
    const targetChannel = settings.channelId;

    if (!targetChannel) { this.showAlert(context); return; }

    try {
      // Se já está conectado ao canal alvo, desconecta
      if (this._currentChannelId === targetChannel) {
        await this.rpc.selectVoiceChannel(null);
        this._currentChannelId = null;
        this.updateState(context);
        return;
      }
      // Se está conectado em outro canal, desconecta primeiro
      if (this._currentChannelId) {
        await this.rpc.selectVoiceChannel(null);
        this._currentChannelId = null;
        await new Promise(r => setTimeout(r, 400));
      }
      // Conecta ao canal alvo
      await this.rpc.selectVoiceChannel(targetChannel);
      this._currentChannelId = targetChannel;
      this.updateState(context);
    } catch (err) {
      logger.error('Voice channel action failed:', err.message);
      this.showAlert(context);
    }
  }

  didReceiveSettings({ context, payload }) {
    super.didReceiveSettings({ context, payload });
    // Clear cached icon so it's re-fetched for the new guild
    const settings = payload?.settings || {};
    if (settings.guildId) {
      _iconCache.delete(settings.guildId);
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
          guildChannels[guild.id] = channels.filter(c => c.type === 2);
        } catch {
          guildChannels[guild.id] = [];
        }
      }
      this.sendToPI(context, { command: 'guildChannels', data: guildChannels });

      const settings = this.getSettings(context);
      if (settings && settings.guildId) {
        const voiceChannels = guildChannels[settings.guildId] || [];
        this.sendToPI(context, { command: 'channels', data: voiceChannels });
      }

      this.sendToPI(context, {
        command: 'status',
        data: { connected: true, authenticated: true }
      });
    } catch (err) {
      logger.error('Failed to send initial PI voice data:', err.message);
      this.sendToPI(context, { command: 'error', data: err.message });
    }
  }

  async onSendToPlugin({ context, payload }) {
    if (!this.isReady()) {
      logger.warn('Voice channel: Discord not ready, sending status to PI');
      this.sendToPI(context, {
        command: 'status',
        data: { connected: this.rpc.connected, authenticated: this.rpc.authenticated }
      });
      return;
    }

    switch (payload?.command) {
      case 'getGuilds': {
        try {
          logger.info('Fetching guilds from Discord...');
          const guilds = await this.rpc.getGuilds();
          logger.info(`Got ${guilds.length} guilds`);
          this.sendToPI(context, { command: 'guilds', data: guilds });
        } catch (err) {
          logger.error('Failed to get guilds:', err.message);
          this.sendToPI(context, { command: 'error', data: err.message });
        }
        break;
      }
      case 'getChannels': {
        try {
          logger.info('Fetching channels for guild:', payload.guildId);
          const channels = await this.rpc.getChannels(payload.guildId);
          const voiceChannels = channels.filter(c => c.type === 2);
          logger.info(`Got ${voiceChannels.length} voice channels`);
          this.sendToPI(context, { command: 'channels', data: voiceChannels });
        } catch (err) {
          logger.error('Failed to get channels:', err.message);
          this.sendToPI(context, { command: 'error', data: err.message });
        }
        break;
      }
    }
  }

  async updateState(context) {
    if (!this.isReady()) {
      this._stopAvatarRotation();
      return;
    }
    const settings = this.getSettings(context);
    const isConnected = this._currentChannelId === settings.channelId;
    this.setState(context, isConnected ? 1 : 0);

    if (isConnected) {
      // Inicia rotação de avatares
      this._startAvatarRotation(context);
    } else {
      // Para rotação e mostra ícone padrão
      this._stopAvatarRotation();
      await this._setDefaultIcon(context);
    }
  }
}

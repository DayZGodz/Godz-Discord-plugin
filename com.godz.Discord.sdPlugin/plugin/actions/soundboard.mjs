// Godz Discord Plugin - Soundboard Action
// Uses undocumented RPC commands — falls back with error if unavailable
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';

export class SoundboardAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.soundboard');
  }

  onWillAppear({ context, payload }) {
    super.onWillAppear({ context, payload });
    this._updateDisplay(context);
  }

  didReceiveSettings({ context, payload }) {
    super.didReceiveSettings({ context, payload });
    this._updateDisplay(context);
  }

  _updateDisplay(context) {
    const settings = this.getSettings(context);
    if (settings.soundName) {
      this.setTitle(context, settings.soundName);
    }
    // Use cached emoji image from PI (rendered on canvas or fetched from CDN)
    if (settings.emojiImage) {
      this.setImage(context, settings.emojiImage);
    } else if (settings.emojiId) {
      // Fallback: fetch custom emoji from Discord CDN
      this._fetchEmojiImage(context, settings.emojiId);
    }
  }

  async _fetchEmojiImage(context, emojiId) {
    try {
      const url = `https://cdn.discordapp.com/emojis/${encodeURIComponent(emojiId)}.webp?size=96`;
      const resp = await fetch(url);
      if (!resp.ok) return;
      const buf = Buffer.from(await resp.arrayBuffer());
      const dataUri = `data:image/webp;base64,${buf.toString('base64')}`;
      this.setImage(context, dataUri);
    } catch (err) {
      logger.error('Failed to fetch emoji image:', err.message);
    }
  }

  async onKeyDown({ context }) {
    if (!this.isReady()) { this.showAlert(context); return; }
    // Buscar settings diretamente do evento, igual Mirabox
    let settings = {};
    if (arguments[0]?.payload?.settings) {
      settings = arguments[0].payload.settings;
    } else {
      settings = this.getSettings(context);
    }
    if (!settings.soundId) { this.showAlert(context); return; }
    const soundObj = {
      sound_id: settings.soundId,
      guild_id: settings.guildId
    };
    try {
      logger.info('Soundboard DEBUG: sending object to Discord:', JSON.stringify(soundObj));
      await this.rpc.request('PLAY_SOUNDBOARD_SOUND', soundObj);
      this.showOk(context);
      logger.info('Soundboard played:', soundObj.sound_id || '');
    } catch (err) {
      logger.error('Soundboard play failed:', err.message);
      this.showAlert(context);
    }
  }

  async onPropertyInspectorAppear({ context }) {
    logger.info('Soundboard PI appeared, ready:', this.isReady());
    if (!this.isReady()) {
      this.sendToPI(context, {
        command: 'status',
        data: { connected: this.rpc.connected, authenticated: this.rpc.authenticated }
      });
      return;
    }

    await this._fetchAndSendSounds(context);
  }

  async _fetchAndSendSounds(context) {
    try {
      logger.info('Soundboard: fetching all sounds...');
      const result = await this.rpc.request('GET_SOUNDBOARD_SOUNDS');
      const allSounds = result.data?.soundboard_sounds || result.data?.items || result.data || [];
      logger.info('Soundboard: got', allSounds.length, 'raw sounds');

      // Buscar todos os servidores do usuário
      let allGuilds = [];
      try {
        allGuilds = await this.rpc.getGuilds();
      } catch (e) {
        logger.warn('Soundboard: getGuilds failed:', e.message);
      }

      // Group sounds by guild_id
      const soundsByGuild = {};
      for (const sound of allSounds) {
        const gid = sound.guild_id || '0';
        if (!soundsByGuild[gid]) {
          soundsByGuild[gid] = { guildName: '', sounds: [] };
        }
        soundsByGuild[gid].sounds.push(sound);
      }

      // Montar lista de guilds para dropdown (todos, mesmo sem sons)
      const allGuildsMap = {};
      for (const g of allGuilds) {
        allGuildsMap[g.id] = { guildName: g.name, sounds: [] };
      }
      // Adicionar guilds que só existem nos sons (ex: Discord padrão)
      for (const gid of Object.keys(soundsByGuild)) {
        if (!allGuildsMap[gid]) {
          allGuildsMap[gid] = { guildName: soundsByGuild[gid].guildName || gid, sounds: [] };
        }
      }
      // Preencher sons em cada guild
      for (const gid of Object.keys(soundsByGuild)) {
        allGuildsMap[gid].sounds = soundsByGuild[gid].sounds;
        if (soundsByGuild[gid].guildName) allGuildsMap[gid].guildName = soundsByGuild[gid].guildName;
      }

      // Sempre envie todos os guilds com sons para o PI
      this.sendToPI(context, { command: 'allSounds', data: allGuildsMap });
      logger.info('Soundboard: sent sounds for', Object.keys(allGuildsMap).length, 'guilds');
    } catch (err) {
      logger.error('Soundboard fetch failed:', err.message);
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

    if (payload?.command === 'refresh') {
      await this._fetchAndSendSounds(context);
      return;
    }

     // Nenhuma ação direta, tudo via settings
     // ... outros comandos
  }
}

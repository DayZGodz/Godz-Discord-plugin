

// Godz Discord Plugin - User Volume Control Action
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';
import { adjustVolume, toPercent } from '../lib/volume-utils.mjs';

export class UserVolumeAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.userVolume');
    this._voiceUsers = {};
    this._activeContexts = new Set();
  }

  _startVoiceUsersPolling() {
    if (this._voiceUsersInterval) clearInterval(this._voiceUsersInterval);
    this._lastVoiceUsers = [];
    this._voiceUsersInterval = setInterval(async () => {
      try {
        const channel = await this.rpc.getSelectedVoiceChannel();
        const users = Array.isArray(channel?.voice_states)
          ? channel.voice_states.map(vs => ({
              id: vs.user?.id,
              username: vs.user?.username,
              avatar: vs.user?.avatar,
              nickname: vs.nick,
              volume: vs.voice_state?.volume,
              mute: vs.voice_state?.mute
            }))
          : [];
        const changed = JSON.stringify(users) !== JSON.stringify(this._lastVoiceUsers);
        if (changed) {
          this._lastVoiceUsers = users;
          let selfId = '';
          if (this.rpc && this.rpc.user) selfId = this.rpc.user.id;
          if (this._activeContexts && this._activeContexts.size) {
            for (const context of this._activeContexts) {
              this.sendToPI(context, { command: 'voiceUsers', data: users, selectedUserId: this.getSettings(context)?.userId, selfId });
            }
          }
        }
      } catch (err) {
        // Ignora erros de polling
      }
    }, 2000);
  }

  // Atualiza o ícone do botão para o avatar do usuário selecionado
  async updateState(context) {
    if (!this.isReady()) return;
    const settings = this.getSettings(context);
    if (settings && settings.userId) {
      try {
        const channel = await this.rpc.getSelectedVoiceChannel();
        const user = Array.isArray(channel?.voice_states)
          ? channel.voice_states.map(vs => vs.user).find(u => u && u.id === settings.userId)
          : null;
        if (user && user.avatar) {
          const url = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=96`;
          const resp = await fetch(url);
          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            const mime = resp.headers.get('content-type') || 'image/png';
            const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
            this.setImage(context, dataUri);
          }
        }
      } catch (err) {
        logger.error('updateState: erro ao buscar usuário/voz:', err.message);
      }
    }
  }

  async onKeyDown({ context }) {
    if (!this.isReady()) { this.showAlert(context); return; }
    const settings = this.getSettings(context);
    if (!settings.userId) { this.showAlert(context); return; }
    try {
      // Pressionar: alterna mute/desmute
      const currentMute = settings._userMuted || false;
      await this.rpc.setUserMute(settings.userId, !currentMute);
      this.saveSettings(context, { _userMuted: !currentMute });
    } catch (err) {
      logger.error('User volume failed:', err.message);
      this.showAlert(context);
    }
  }

  async onDialPress({ context, payload }) {
    if (payload?.pressed) return;
    if (!this.isReady()) { this.showAlert(context); return; }
    const settings = this.getSettings(context);
    if (!settings.userId) { this.showAlert(context); return; }
    try {
      const currentMute = settings._userMuted || false;
      await this.rpc.setUserMute(settings.userId, !currentMute);
      this.saveSettings(context, { _userMuted: !currentMute });
    } catch (err) {
      logger.error('User volume dial press failed:', err.message);
      this.showAlert(context);
    }
  }

  async onDialRotate({ context, payload }) {
    if (!this.isReady()) return;
    const settings = this.getSettings(context);
    if (!settings.userId) return;
    const ticks = payload?.ticks || 0;
    const step = parseInt(settings.knobStep, 10) || 5;
    try {
      const currentVol = settings._currentVolume || 100;
      const newRaw = adjustVolume(currentVol, step * ticks);
      await this.rpc.setUserVolume(settings.userId, newRaw);
      this.saveSettings(context, { _currentVolume: newRaw });
      this.setTitle(context, `${toPercent(newRaw)}%`);
    } catch (err) {
      logger.error('User volume dial rotate failed:', err.message);
    }
  }

  async onPropertyInspectorAppear({ context }) {
    // Marca context como ativo e inicia polling global se necessário
    if (!this._activeContexts) this._activeContexts = new Set();
    this._activeContexts.add(context);
    if (!this._voiceUsersInterval) this._startVoiceUsersPolling();
    if (!this.isReady()) {
      this.sendToPI(context, {
        command: 'status',
        data: { connected: this.rpc.connected, authenticated: this.rpc.authenticated }
      });
      return;
    }
    try {
      const channel = await this.rpc.getSelectedVoiceChannel();
      logger.info('UserVolume DEBUG: getSelectedVoiceChannel() retorno:', JSON.stringify(channel));
      const users = Array.isArray(channel?.voice_states)
        ? channel.voice_states.map(vs => ({
            id: vs.user?.id,
            username: vs.user?.username,
            avatar: vs.user?.avatar,
            nickname: vs.nick,
            volume: vs.voice_state?.volume,
            mute: vs.voice_state?.mute
          }))
        : [];
      logger.info('UserVolume PI: Enviando usuários para PI:', users.length, users.map(u => u.username || u.id));
      this._voiceUsers[context] = users;
      const settings = this.getSettings(context) || {};
      let selfId = '';
      if (this.rpc && this.rpc.user) selfId = this.rpc.user.id;
      this.sendToPI(context, { command: 'voiceUsers', data: users, selectedUserId: settings.userId, selfId });
      await this.updateState(context);
    } catch (err) {
      logger.error('Get voice users on PI appear failed:', err.message);
      const settings = this.getSettings(context) || {};
      this.sendToPI(context, { command: 'voiceUsers', data: [], selectedUserId: settings.userId });
    }
  }
  async onPropertyInspectorDisappear({ context }) {
    // Remove context do set de ativos e para polling se não houver mais nenhum
    if (this._activeContexts) this._activeContexts.delete(context);
    if (this._activeContexts && this._activeContexts.size === 0 && this._voiceUsersInterval) {
      clearInterval(this._voiceUsersInterval);
      this._voiceUsersInterval = null;
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
    if (payload?.command === 'getVoiceUsers') {
      try {
        const channel = await this.rpc.getSelectedVoiceChannel();
        const users = channel?.voice_states?.map(vs => ({
          id: vs.user?.id,
          username: vs.user?.username,
          avatar: vs.user?.avatar,
          nickname: vs.nick,
          volume: vs.voice_state?.volume,
          mute: vs.voice_state?.mute
        })) || [];
        this._voiceUsers[context] = users;
        const settings = this.getSettings(context) || {};
        let selfId = '';
        if (this.rpc && this.rpc.user) selfId = this.rpc.user.id;
        this.sendToPI(context, { command: 'voiceUsers', data: users, selectedUserId: settings.userId, selfId });
        await this.updateState(context);
      } catch (err) {
        logger.error('Get voice users failed:', err.message);
      }
    }
  }

  // Ao receber settings atualizados, reenviar lista de usuários para o PI com o usuário selecionado
  async didReceiveSettings({ context, payload }) {
    // Atualiza o contexto/settings ANTES de atualizar o botão
    if (super.didReceiveSettings) super.didReceiveSettings({ context, payload });
    // Busca a lista de usuários apenas para o PI, mas ações usam sempre settings.userId
    let users = [];
    try {
      const channel = await this.rpc.getSelectedVoiceChannel();
      users = Array.isArray(channel?.voice_states)
        ? channel.voice_states.map(vs => ({
            id: vs.user?.id,
            username: vs.user?.username,
            avatar: vs.user?.avatar,
            nickname: vs.nick,
            volume: vs.voice_state?.volume,
            mute: vs.voice_state?.mute
          }))
        : [];
    } catch (err) {
      logger.error('UserVolume didReceiveSettings: erro ao buscar canal/usuários:', err.message);
    }
    const settings = payload?.settings || {};
    logger.info('UserVolume didReceiveSettings: Enviando usuários para PI:', users.length, users.map(u => u.username || u.id));
    let selfId = '';
    if (this.rpc && this.rpc.user) selfId = this.rpc.user.id;
    this.sendToPI(context, { command: 'voiceUsers', data: users, selectedUserId: settings.userId, selfId });
    this.updateState(context);
  }
}

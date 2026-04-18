// Godz Discord Plugin - Mute Action
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';
import { adjustVolume, toPercent } from '../lib/volume-utils.mjs';

export class MuteAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.mute');
    this._isMuted = false;

    // Listen for voice settings updates
    rpc.on('VOICE_SETTINGS_UPDATE', (msg) => {
      this._isMuted = !!msg.data?.mute;
      this.updateAllContexts();
    });
  }

  async onKeyDown({ context }) {
    if (!this.isReady()) { this.showAlert(context); return; }
    try {
      await this.rpc.toggleMute();
    } catch (err) {
      logger.error('Mute toggle failed:', err.message);
      this.showAlert(context);
    }
  }

  // Encoder: press to toggle mute
  async onDialPress({ context, payload }) {
    if (payload?.pressed) return; // act on release
    if (!this.isReady()) { this.showAlert(context); return; }
    try {
      await this.rpc.toggleMute();
    } catch (err) {
      logger.error('Mute dial press failed:', err.message);
      this.showAlert(context);
    }
  }

  // Encoder: rotate to adjust input volume
  async onDialRotate({ context, payload }) {
    if (!this.isReady()) return;
    const ticks = payload?.ticks || 0;
    const settings = this.getSettings(context);
    const step = parseInt(settings.knobStep, 10) || 5;
    try {
      const vs = await this.rpc.getVoiceSettings();
      const raw = vs.input?.volume || 0;
      const newRaw = adjustVolume(raw, step * ticks);
      await this.rpc.setInputVolume(newRaw);
      this.setTitle(context, `${toPercent(newRaw)}%`);
    } catch (err) {
      logger.error('Mute dial rotate failed:', err.message);
    }
  }

  async updateState(context) {
    if (!this.isReady()) return;
    try {
      const settings = await this.rpc.getVoiceSettings();
      this._isMuted = !!settings.mute;
      this.setState(context, this._isMuted ? 1 : 0);
    } catch { /* ignore */ }
  }
}

// Godz Discord Plugin - Deaf Action
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';
import { adjustVolume, toPercent } from '../lib/volume-utils.mjs';

export class DeafAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.deaf');
    this._isDeaf = false;

    rpc.on('VOICE_SETTINGS_UPDATE', (msg) => {
      this._isDeaf = !!msg.data?.deaf;
      this.updateAllContexts();
    });
  }

  async onKeyDown({ context }) {
    if (!this.isReady()) { this.showAlert(context); return; }
    try {
      await this.rpc.toggleDeaf();
    } catch (err) {
      logger.error('Deaf toggle failed:', err.message);
      this.showAlert(context);
    }
  }

  // Encoder: press to toggle deafen
  async onDialPress({ context, payload }) {
    if (payload?.pressed) return; // act on release
    if (!this.isReady()) { this.showAlert(context); return; }
    try {
      await this.rpc.toggleDeaf();
    } catch (err) {
      logger.error('Deaf dial press failed:', err.message);
      this.showAlert(context);
    }
  }

  // Encoder: rotate to adjust output volume
  async onDialRotate({ context, payload }) {
    if (!this.isReady()) return;
    const ticks = payload?.ticks || 0;
    const settings = this.getSettings(context);
    const step = parseInt(settings.knobStep, 10) || 5;
    try {
      const vs = await this.rpc.getVoiceSettings();
      const raw = vs.output?.volume || 0;
      const newRaw = adjustVolume(raw, step * ticks);
      await this.rpc.setOutputVolume(newRaw);
      this.setTitle(context, `${toPercent(newRaw)}%`);
    } catch (err) {
      logger.error('Deaf dial rotate failed:', err.message);
    }
  }

  async updateState(context) {
    if (!this.isReady()) return;
    try {
      const settings = await this.rpc.getVoiceSettings();
      this._isDeaf = !!settings.deaf;
      this.setState(context, this._isDeaf ? 1 : 0);
    } catch { /* ignore */ }
  }
}

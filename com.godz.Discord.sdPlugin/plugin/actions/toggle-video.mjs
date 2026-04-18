// Godz Discord Plugin - Toggle Video Action
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';

export class ToggleVideoAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.toggleVideo');
    this._videoOn = false;
    this._lastToggleAt = 0;
  }

  async onKeyUp({ context }) {
    const now = Date.now();
    if (now - this._lastToggleAt < 1500) return;
    this._lastToggleAt = now;

    if (!this.isReady()) { this.showAlert(context); return; }
    try {
      await this.rpc.request('TOGGLE_VIDEO');
      this._videoOn = !this._videoOn;
      this.setState(context, this._videoOn ? 1 : 0);
      logger.info('TOGGLE_VIDEO sent, videoOn:', this._videoOn);
    } catch (err) {
      logger.error('Toggle video failed:', err.message);
      this.showAlert(context);
    }
  }

  updateState(context) {
    this.setState(context, this._videoOn ? 1 : 0);
  }
}

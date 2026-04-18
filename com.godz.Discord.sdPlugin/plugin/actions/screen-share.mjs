// Godz Discord Plugin - Screen Share Action
// Simple toggle — opens Discord's native picker for you to choose the screen

import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';

export class ScreenShareAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.screenShare');
    this._isSharing = false;
    this._lastToggleAt = 0;
  }

  async onKeyUp({ context }) {
    const now = Date.now();
    if (now - this._lastToggleAt < 1500) return;
    this._lastToggleAt = now;

    if (!this.isReady()) { this.showAlert(context); return; }

    try {
      await this.rpc.request('TOGGLE_SCREENSHARE');
      this._isSharing = !this._isSharing;
      this.setState(context, this._isSharing ? 1 : 0);
      logger.info('TOGGLE_SCREENSHARE sent, isSharing:', this._isSharing);
    } catch (err) {
      logger.error('Screen share toggle failed:', { message: err.message, code: err.code });
      this.showAlert(context);
    }
  }

  updateState(context) {
    this.setState(context, this._isSharing ? 1 : 0);
  }
}

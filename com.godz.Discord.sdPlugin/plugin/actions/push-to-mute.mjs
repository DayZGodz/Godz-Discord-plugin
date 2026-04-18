// Godz Discord Plugin - Push to Mute Action
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';

export class PushToMuteAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.pushToMute');
  }

  async onKeyDown({ context }) {
    if (!this.isReady()) { this.showAlert(context); return; }
    try {
      // Mute while key is held
      await this.rpc.setMute(true);
      this.setState(context, 1);
    } catch (err) {
      logger.error('Push to mute down failed:', err.message);
    }
  }

  async onKeyUp({ context }) {
    if (!this.isReady()) return;
    try {
      // Unmute when key is released
      await this.rpc.setMute(false);
      this.setState(context, 0);
    } catch (err) {
      logger.error('Push to mute up failed:', err.message);
    }
  }
}

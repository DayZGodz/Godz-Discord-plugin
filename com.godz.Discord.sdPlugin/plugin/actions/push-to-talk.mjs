// Godz Discord Plugin - Push to Talk Action
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';

export class PushToTalkAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.pushToTalk');
  }

  async onKeyDown({ context }) {
    if (!this.isReady()) { this.showAlert(context); return; }
    try {
      // Unmute while key is held
      await this.rpc.setMute(false);
      this.setState(context, 1);
    } catch (err) {
      logger.error('Push to talk down failed:', err.message);
    }
  }

  async onKeyUp({ context }) {
    if (!this.isReady()) return;
    try {
      // Re-mute when key is released
      await this.rpc.setMute(true);
      this.setState(context, 0);
    } catch (err) {
      logger.error('Push to talk up failed:', err.message);
    }
  }
}

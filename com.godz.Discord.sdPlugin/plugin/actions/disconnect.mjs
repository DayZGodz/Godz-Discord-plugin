// Godz Discord Plugin - Disconnect Action
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';

export class DisconnectAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.disconnect');
  }

  async onKeyDown({ context }) {
    if (!this.isReady()) { this.showAlert(context); return; }
    try {
      await this.rpc.disconnectVoice();
      this.showOk(context);
    } catch (err) {
      logger.error('Disconnect failed:', err.message);
      this.showAlert(context);
    }
  }
}

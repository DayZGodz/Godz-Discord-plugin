// Godz Discord Plugin - Notifications Action
// NOTIFICATION_CREATE subscription is handled globally in index.mjs _subscribeToEvents()
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';

export class NoticeAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.notice');
    this._notificationCount = 0;

    rpc.on('NOTIFICATION_CREATE', (msg) => {
      this._notificationCount++;
      logger.debug('Notification received, count:', this._notificationCount);
      this.updateAllContexts();
    });

    // Re-subscribe after reconnection
    rpc.on('authenticated', async () => {
      // Subscription is done in index.mjs, but ensure it's there
      logger.debug('NoticeAction: Discord authenticated, notifications should be subscribed');
    });
  }

  async onKeyDown({ context }) {
    // Reset notification count on press
    this._notificationCount = 0;
    this.updateState(context);
    this.showOk(context);
  }

  updateState(context) {
    const count = this._notificationCount;
    this.setTitle(context, count > 0 ? `${count}` : '');
  }
}

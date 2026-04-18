// Godz Discord Plugin - Noise Suppression Action
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';

export class NoiseSuppressionAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.noiseSuppression');
    this._enabled = false;

    rpc.on('VOICE_SETTINGS_UPDATE', (msg) => {
      const data = msg.data;
      if (data) {
        // Discord returns mode.type as 'NOISE_SUPPRESSION' or noise_suppression as boolean
        if (data.mode?.type !== undefined) {
          this._enabled = data.mode.type === 'NOISE_SUPPRESSION';
        } else if (data.noise_suppression !== undefined) {
          this._enabled = !!data.noise_suppression;
        }
      }
      this.updateAllContexts();
    });
  }

  async onKeyDown({ context }) {
    if (!this.isReady()) { this.showAlert(context); return; }
    try {
      // Read current state from Discord first
      const vs = await this.rpc.getVoiceSettings();
      const currentEnabled = vs.mode?.type === 'NOISE_SUPPRESSION' ||
                             !!vs.noise_suppression;
      this._enabled = !currentEnabled;

      // Discord uses mode.type to control noise suppression
      if (this._enabled) {
        await this.rpc.setVoiceSettings({
          mode: { type: 'NOISE_SUPPRESSION' }
        });
      } else {
        await this.rpc.setVoiceSettings({
          mode: { type: 'VOICE_ACTIVITY' }
        });
      }

      this.setState(context, this._enabled ? 1 : 0);
      logger.info('Noise suppression toggled:', this._enabled);
    } catch (err) {
      logger.error('Noise suppression toggle failed:', err.message);
      // Fallback: try with noise_suppression field directly
      try {
        await this.rpc.setVoiceSettings({
          noise_suppression: this._enabled
        });
        this.setState(context, this._enabled ? 1 : 0);
        logger.info('Noise suppression set via fallback:', this._enabled);
      } catch (err2) {
        logger.error('Noise suppression fallback also failed:', err2.message);
        this._enabled = !this._enabled; // revert
        this.showAlert(context);
      }
    }
  }

  async updateState(context) {
    if (!this.isReady()) return;
    try {
      const vs = await this.rpc.getVoiceSettings();
      this._enabled = vs.mode?.type === 'NOISE_SUPPRESSION' ||
                      !!vs.noise_suppression;
      this.setState(context, this._enabled ? 1 : 0);
    } catch { /* ignore */ }
  }
}

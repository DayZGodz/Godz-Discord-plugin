// Godz Discord Plugin - Set Audio Devices Action
import { BaseAction } from './base-action.mjs';
import { logger } from '../lib/logger.mjs';

export class SetDevicesAction extends BaseAction {
  constructor(sdk, rpc) {
    super(sdk, rpc, 'com.godz.discord.setDevices');
  }

  async onKeyDown({ context }) {
    if (!this.isReady()) { this.showAlert(context); return; }
    const settings = this.getSettings(context);
    const mode = settings.mode || 'both'; // 'input', 'output', 'both'

    try {
      if (mode === 'input' || mode === 'both') {
        if (settings.inputDeviceId) {
          await this.rpc.setInputDevice(settings.inputDeviceId);
        }
      }
      if (mode === 'output' || mode === 'both') {
        if (settings.outputDeviceId) {
          await this.rpc.setOutputDevice(settings.outputDeviceId);
        }
      }
      this.showOk(context);
    } catch (err) {
      logger.error('Set devices failed:', err.message);
      this.showAlert(context);
    }
  }

  async onPropertyInspectorAppear({ context }) {
    logger.info('SetDevices PI appeared, ready:', this.isReady());
    if (!this.isReady()) {
      this.sendToPI(context, {
        command: 'status',
        data: { connected: this.rpc.connected, authenticated: this.rpc.authenticated }
      });
      return;
    }

    try {
      logger.info('SetDevices: fetching voice settings...');
      const voiceSettings = await this.rpc.getVoiceSettings();
      this.sendToPI(context, {
        command: 'devices',
        data: {
          input: voiceSettings.input,
          output: voiceSettings.output,
          availableInputDevices: voiceSettings.input?.available_devices || [],
          availableOutputDevices: voiceSettings.output?.available_devices || []
        }
      });
    } catch (err) {
      logger.error('Get devices on PI appear failed:', err.message);
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

    if (payload?.command === 'getDevices') {
      try {
        const voiceSettings = await this.rpc.getVoiceSettings();
        this.sendToPI(context, {
          command: 'devices',
          data: {
            input: voiceSettings.input,
            output: voiceSettings.output,
            availableInputDevices: voiceSettings.input?.available_devices || [],
            availableOutputDevices: voiceSettings.output?.available_devices || []
          }
        });
      } catch (err) {
        logger.error('Get devices failed:', err.message);
      }
    }
  }
}

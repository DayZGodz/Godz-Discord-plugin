// Godz Discord Plugin - Base Action Handler
// All action handlers extend this class

import { logger } from '../lib/logger.mjs';

export class BaseAction {
  constructor(sdk, rpc, actionUUID) {
    this.sdk = sdk;
    this.rpc = rpc;
    this.uuid = actionUUID;
    this.contexts = new Map(); // context -> { settings, device }
  }

  // Lifecycle
  onWillAppear({ context, payload }) {
    this.contexts.set(context, { settings: payload?.settings || {} });
    this.updateState(context);
  }

  onWillDisappear({ context }) {
    this.contexts.delete(context);
  }

  // Input
  onKeyDown({ context, payload }) { }
  onKeyUp({ context, payload }) { }
  onDialRotate({ context, payload }) { }
  onDialPress({ context, payload }) { }

  // Settings
  didReceiveSettings({ context, payload }) {
    const data = this.contexts.get(context);
    if (data) {
      data.settings = payload?.settings || {};
    }
    this.updateState(context);
  }

  didReceiveGlobalSettings(msg) { }

  // Plugin messages from PI
  onSendToPlugin({ context, payload }) { }

  // Property Inspector
  onPropertyInspectorAppear({ context }) { }
  onPropertyInspectorDisappear({ context }) { }

  // Helpers
  getSettings(context) {
    return this.contexts.get(context)?.settings || {};
  }

  saveSettings(context, settings) {
    const data = this.contexts.get(context);
    if (data) {
      data.settings = { ...data.settings, ...settings };
    }
    this.sdk.setSettings(context, data?.settings || settings);
  }

  setState(context, state) {
    this.sdk.setState(context, state);
  }

  setTitle(context, title) {
    this.sdk.setTitle(context, title);
  }

  setImage(context, image) {
    this.sdk.setImage(context, image);
  }

  sendToPI(context, payload) {
    logger.debug(`sendToPI [${this.uuid}] ctx=${context?.substring(0,8)}... cmd=${payload?.command}`);
    this.sdk.sendToPropertyInspector(context, this.uuid, payload);
  }

  showAlert(context) {
    this.sdk.showAlert(context);
  }

  showOk(context) {
    this.sdk.showOk(context);
  }

  // Override in subclass to update button visuals
  updateState(context) { }

  // Check if Discord is connected and authenticated
  isReady() {
    return this.rpc.connected && this.rpc.authenticated;
  }

  // Update all active contexts
  updateAllContexts() {
    for (const [context] of this.contexts) {
      this.updateState(context);
    }
  }
}

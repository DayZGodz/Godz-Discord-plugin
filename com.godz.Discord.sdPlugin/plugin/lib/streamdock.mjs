// Godz Discord Plugin - StreamDock SDK WebSocket Client
// Handles communication between the plugin and the StreamDock software

import { createConnection } from 'node:net';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { logger } from './logger.mjs';

// Minimal WebSocket client using Node.js built-in modules (no external deps)
class SimpleWebSocket {
  constructor(url) {
    this.url = new URL(url);
    this.socket = null;
    this.readyState = 0; // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
    this._handlers = { open: [], message: [], close: [], error: [] };
    this._buffer = Buffer.alloc(0);
    this._connect();
  }

  static get OPEN() { return 1; }

  on(event, handler) {
    (this._handlers[event] = this._handlers[event] || []).push(handler);
  }

  send(data) {
    if (this.readyState !== 1) return;
    const payload = Buffer.from(data, 'utf8');
    const frame = this._createFrame(payload, 0x01); // text frame
    this.socket.write(frame);
  }

  close() {
    this.readyState = 2;
    if (this.socket) {
      const frame = this._createFrame(Buffer.alloc(0), 0x08); // close frame
      try { this.socket.write(frame); } catch { /* ignore */ }
      this.socket.end();
    }
  }

  _connect() {
    const port = parseInt(this.url.port, 10) || 80;
    const host = this.url.hostname || '127.0.0.1';
    const path = this.url.pathname || '/';
    const key = Buffer.from(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))).toString('base64');

    const req = httpRequest({
      host, port,
      path,
      method: 'GET',
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13'
      }
    });

    req.on('upgrade', (res, socket) => {
      this.socket = socket;
      this.readyState = 1;
      this._emit('open');

      socket.on('data', (data) => this._onData(data));
      socket.on('close', () => {
        this.readyState = 3;
        this._emit('close');
      });
      socket.on('error', (err) => this._emit('error', err));
    });

    req.on('error', (err) => {
      this.readyState = 3;
      this._emit('error', err);
    });

    req.end();
  }

  _onData(data) {
    this._buffer = Buffer.concat([this._buffer, data]);
    while (this._buffer.length >= 2) {
      const parsed = this._parseFrame(this._buffer);
      if (!parsed) break;
      this._buffer = this._buffer.subarray(parsed.totalLength);

      if (parsed.opcode === 0x01 || parsed.opcode === 0x02) {
        this._emit('message', parsed.payload.toString('utf8'));
      } else if (parsed.opcode === 0x08) {
        this.readyState = 3;
        if (this.socket) this.socket.end();
        this._emit('close');
      } else if (parsed.opcode === 0x09) {
        // Ping → Pong
        const pong = this._createFrame(parsed.payload, 0x0A);
        this.socket?.write(pong);
      }
    }
  }

  _parseFrame(buf) {
    if (buf.length < 2) return null;
    const opcode = buf[0] & 0x0F;
    const masked = (buf[1] & 0x80) !== 0;
    let payloadLen = buf[1] & 0x7F;
    let offset = 2;

    if (payloadLen === 126) {
      if (buf.length < 4) return null;
      payloadLen = buf.readUInt16BE(2);
      offset = 4;
    } else if (payloadLen === 127) {
      if (buf.length < 10) return null;
      payloadLen = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }

    if (masked) offset += 4;
    if (buf.length < offset + payloadLen) return null;

    let payload = buf.subarray(offset, offset + payloadLen);
    if (masked) {
      const mask = buf.subarray(offset - 4, offset);
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i & 3];
      }
    }

    return { opcode, payload, totalLength: offset + payloadLen };
  }

  _createFrame(payload, opcode) {
    const mask = Buffer.from([
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256)
    ]);

    let header;
    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | payload.length;
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }

    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) {
      masked[i] ^= mask[i & 3];
    }

    return Buffer.concat([header, mask, masked]);
  }

  _emit(event, data) {
    (this._handlers[event] || []).forEach(h => {
      try { h(data); } catch (e) { console.error('WS event error:', e); }
    });
  }
}

const WebSocket = SimpleWebSocket;

export class StreamDockSDK {
  constructor() {
    this.ws = null;
    this.port = null;
    this.pluginUUID = null;
    this.registerEvent = null;
    this.info = null;
    this.actions = new Map();       // context -> action data
    this.actionHandlers = new Map(); // UUID -> handler class
    this.globalSettings = {};
    this._eventHandlers = new Map();
  }

  // Parse command line arguments from StreamDock
  parseArgs(args) {
    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '-port':
          this.port = parseInt(args[++i], 10);
          break;
        case '-pluginUUID':
          this.pluginUUID = args[++i];
          break;
        case '-registerEvent':
          this.registerEvent = args[++i];
          break;
        case '-info':
          this.info = JSON.parse(args[++i]);
          break;
      }
    }
    logger.info('Parsed args:', { port: this.port, uuid: this.pluginUUID, event: this.registerEvent });
  }

  // Connect to StreamDock WebSocket
  connect() {
    return new Promise((resolve, reject) => {
      const url = `ws://127.0.0.1:${this.port}`;
      logger.info('Connecting to StreamDock:', url);

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        logger.info('WebSocket connected, registering plugin...');
        this.send({ event: this.registerEvent, uuid: this.pluginUUID });
        this.getGlobalSettings();
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleMessage(msg);
        } catch (err) {
          logger.error('Failed to parse message:', err.message);
        }
      });

      this.ws.on('close', () => {
        logger.warn('WebSocket disconnected from StreamDock');
        setTimeout(() => this.connect(), 5000);
      });

      this.ws.on('error', (err) => {
        logger.error('WebSocket error:', err.message);
        reject(err);
      });
    });
  }

  // Register an action handler
  registerAction(uuid, handler) {
    this.actionHandlers.set(uuid, handler);
    logger.info('Registered action handler:', uuid);
  }

  // Send raw message to StreamDock
  send(payload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  // SDK Methods
  setState(context, state) {
    this.send({ event: 'setState', context, payload: { state } });
  }

  setTitle(context, title, row = 0, num = 6, target = 0) {
    let newStr = '';
    if (row && title) {
      let nowRow = 1;
      const strArr = title.split('');
      strArr.forEach((item, index) => {
        if (nowRow < row && index >= nowRow * num) {
          nowRow++;
          newStr += '\n';
        }
        if (nowRow <= row && index < nowRow * num) {
          newStr += item;
        }
      });
      if (strArr.length > row * num) {
        newStr = newStr.substring(0, newStr.length - 1) + '..';
      }
    }
    this.send({ event: 'setTitle', context, payload: { title: newStr || (title + ''), target } });
  }

  setImage(context, image, target = 0) {
    this.send({ event: 'setImage', context, payload: { image, target } });
  }

  setSettings(context, settings) {
    this.send({ event: 'setSettings', context, payload: settings });
  }

  getSettings(context) {
    this.send({ event: 'getSettings', context });
  }

  setGlobalSettings(settings) {
    this.globalSettings = { ...this.globalSettings, ...settings };
    this.send({ event: 'setGlobalSettings', context: this.pluginUUID, payload: this.globalSettings });
  }

  getGlobalSettings() {
    this.send({ event: 'getGlobalSettings', context: this.pluginUUID });
  }

  sendToPropertyInspector(context, action, payload) {
    this.send({ event: 'sendToPropertyInspector', context, action, payload });
  }

  openUrl(url) {
    this.send({ event: 'openUrl', payload: { url } });
  }

  showAlert(context) {
    this.send({ event: 'showAlert', context });
  }

  showOk(context) {
    this.send({ event: 'showOk', context });
  }

  // Event handler registration
  on(event, handler) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, []);
    }
    this._eventHandlers.get(event).push(handler);
  }

  // Internal message handler
  _handleMessage(msg) {
    const { event, action, context, payload, device } = msg;
    logger.debug('Received event:', event, action);

    // Emit raw event
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(h => h(msg));
    }

    switch (event) {
      case 'didReceiveGlobalSettings':
        this.globalSettings = payload?.settings || {};
        this._notifyAllActions('didReceiveGlobalSettings', msg);
        break;

      case 'didReceiveSettings':
        if (context && action) {
          this.actions.set(context, { action, settings: payload?.settings || {}, device });
        }
        this._dispatchToAction(action, 'didReceiveSettings', { context, payload, device });
        break;

      case 'keyDown':
        this._dispatchToAction(action, 'onKeyDown', { context, payload, device });
        break;

      case 'keyUp':
        this._dispatchToAction(action, 'onKeyUp', { context, payload, device });
        break;

      case 'willAppear':
        if (context && action) {
          this.actions.set(context, { action, settings: payload?.settings || {}, device });
        }
        this._dispatchToAction(action, 'onWillAppear', { context, payload, device });
        break;

      case 'willDisappear':
        this._dispatchToAction(action, 'onWillDisappear', { context, payload, device });
        this.actions.delete(context);
        break;

      case 'sendToPlugin':
        this._dispatchToAction(action, 'onSendToPlugin', { context, payload, device });
        break;

      case 'propertyInspectorDidAppear':
        this._dispatchToAction(action, 'onPropertyInspectorAppear', { context, payload, device });
        break;

      case 'propertyInspectorDidDisappear':
        this._dispatchToAction(action, 'onPropertyInspectorDisappear', { context, payload, device });
        break;

      case 'dialRotate':
        this._dispatchToAction(action, 'onDialRotate', { context, payload, device });
        break;

      case 'dialPress':
        this._dispatchToAction(action, 'onDialPress', { context, payload, device });
        break;

      case 'dialUp':
        this._dispatchToAction(action, 'onDialPress', { context, payload: { ...payload, pressed: false }, device });
        break;

      case 'dialDown':
        this._dispatchToAction(action, 'onDialPress', { context, payload: { ...payload, pressed: true }, device });
        break;

      default:
        logger.debug('Unhandled event:', event);
    }
  }

  _dispatchToAction(uuid, method, data) {
    const handler = this.actionHandlers.get(uuid);
    if (handler && typeof handler[method] === 'function') {
      try {
        handler[method](data);
      } catch (err) {
        logger.error(`Error in ${uuid}.${method}:`, err.message);
      }
    }
  }

  _notifyAllActions(method, data) {
    for (const [, handler] of this.actionHandlers) {
      if (typeof handler[method] === 'function') {
        try {
          handler[method](data);
        } catch (err) {
          logger.error(`Error in handler.${method}:`, err.message);
        }
      }
    }
  }
}

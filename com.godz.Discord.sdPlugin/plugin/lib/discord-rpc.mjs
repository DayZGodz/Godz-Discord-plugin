// Godz Discord Plugin - Discord RPC Client
// Communicates with Discord via local IPC pipe

import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.mjs';

// Discord RPC opcodes
const OP = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
  PING: 3,
  PONG: 4
};

// RPC Commands
export const RPC_CMD = {
  AUTHORIZE: 'AUTHORIZE',
  AUTHENTICATE: 'AUTHENTICATE',
  GET_GUILDS: 'GET_GUILDS',
  GET_GUILD: 'GET_GUILD',
  GET_CHANNELS: 'GET_CHANNELS',
  GET_CHANNEL: 'GET_CHANNEL',
  SELECT_VOICE_CHANNEL: 'SELECT_VOICE_CHANNEL',
  SELECT_TEXT_CHANNEL: 'SELECT_TEXT_CHANNEL',
  GET_SELECTED_VOICE_CHANNEL: 'GET_SELECTED_VOICE_CHANNEL',
  GET_VOICE_SETTINGS: 'GET_VOICE_SETTINGS',
  SET_VOICE_SETTINGS: 'SET_VOICE_SETTINGS',
  SET_USER_VOICE_SETTINGS: 'SET_USER_VOICE_SETTINGS',
  SUBSCRIBE: 'SUBSCRIBE',
  UNSUBSCRIBE: 'UNSUBSCRIBE',
  SET_ACTIVITY: 'SET_ACTIVITY',
  GET_VOICE_CHANNEL: 'GET_VOICE_CHANNEL'
};

// RPC Events
export const RPC_EVT = {
  READY: 'READY',
  ERROR: 'ERROR',
  VOICE_SETTINGS_UPDATE: 'VOICE_SETTINGS_UPDATE',
  VOICE_STATE_CREATE: 'VOICE_STATE_CREATE',
  VOICE_STATE_DELETE: 'VOICE_STATE_DELETE',
  VOICE_STATE_UPDATE: 'VOICE_STATE_UPDATE',
  VOICE_CHANNEL_SELECT: 'VOICE_CHANNEL_SELECT',
  VOICE_CONNECTION_STATUS: 'VOICE_CONNECTION_STATUS',
  SPEAKING_START: 'SPEAKING_START',
  SPEAKING_STOP: 'SPEAKING_STOP',
  NOTIFICATION_CREATE: 'NOTIFICATION_CREATE',
  MESSAGE_CREATE: 'MESSAGE_CREATE',
  MESSAGE_UPDATE: 'MESSAGE_UPDATE',
  MESSAGE_DELETE: 'MESSAGE_DELETE'
};

export class DiscordRPC {
  constructor() {
    this.socket = null;
    this.clientId = null;
    this.accessToken = null;
    this.user = null;
    this.connected = false;
    this.authenticated = false;
    this._buffer = Buffer.alloc(0);
    this._pendingRequests = new Map();
    this._eventHandlers = new Map();
    this._reconnectTimer = null;
    this._connectionAttempts = 0;
  }

  // Connect to Discord IPC pipe
  async connect(clientId) {
    this.clientId = clientId;

    for (let pipeNum = 0; pipeNum < 10; pipeNum++) {
      try {
        await this._connectPipe(pipeNum);
        logger.info(`Connected to Discord IPC pipe ${pipeNum}`);
        this.connected = true;
        this._connectionAttempts = 0;

        // Send handshake
        const ready = await this._handshake();
        this.user = ready.data?.user;
        logger.info('Discord RPC ready, user:', this.user?.username);
        this._emit('ready', ready);
        return ready;
      } catch (err) {
        logger.debug(`Pipe ${pipeNum} failed:`, err.message);
        continue;
      }
    }

    this._connectionAttempts++;
    throw new Error(`Could not connect to Discord IPC (attempt ${this._connectionAttempts})`);
  }

  _connectPipe(pipeNum) {
    return new Promise((resolve, reject) => {
      const pipePath = process.platform === 'win32'
        ? `\\\\?\\pipe\\discord-ipc-${pipeNum}`
        : `/tmp/discord-ipc-${pipeNum}`;

      const socket = net.createConnection(pipePath, () => {
        this.socket = socket;
        resolve();
      });

      socket.on('data', (data) => this._onData(data));
      socket.on('close', () => this._onClose());
      socket.on('error', (err) => reject(err));

      setTimeout(() => {
        if (!this.socket) {
          socket.destroy();
          reject(new Error('Connection timeout'));
        }
      }, 3000);
    });
  }

  _handshake() {
    return new Promise((resolve, reject) => {
      // Listen for READY event
      const onReady = (msg) => {
        if (msg.evt === RPC_EVT.READY) {
          resolve(msg);
        } else if (msg.evt === RPC_EVT.ERROR) {
          reject(new Error(msg.data?.message || 'Handshake failed'));
        }
      };
      this._once('frame', onReady);

      // Send handshake
      this._sendPacket(OP.HANDSHAKE, { v: 1, client_id: this.clientId });
    });
  }

  // Authenticate with access token
  async authenticate(accessToken) {
    this.accessToken = accessToken;
    const result = await this.request(RPC_CMD.AUTHENTICATE, { access_token: accessToken });
    if (result.evt === RPC_EVT.ERROR) {
      throw new Error(result.data?.message || 'Authentication failed');
    }
    this.authenticated = true;
    this.user = result.data?.user;
    logger.info('Authenticated as:', this.user?.username);
    this._emit('authenticated', result);
    return result;
  }

  // Request OAuth2 authorization from Discord
  async authorize(scopes) {
    const result = await this.request(RPC_CMD.AUTHORIZE, {
      client_id: this.clientId,
      scopes
    });
    if (result.evt === RPC_EVT.ERROR) {
      throw new Error(result.data?.message || 'Authorization failed');
    }
    return result.data; // { code: '...' }
  }

  // Send RPC request and wait for response
  request(cmd, args = {}, evt) {
    return new Promise((resolve, reject) => {
      const nonce = randomUUID();
      const timeout = setTimeout(() => {
        this._pendingRequests.delete(nonce);
        reject(new Error(`RPC request timed out: ${cmd}`));
      }, 15000);

      this._pendingRequests.set(nonce, { resolve, reject, timeout });

      this._sendFrame({ cmd, args, evt, nonce });
    });
  }

  // Subscribe to RPC event
  async subscribe(evt, args = {}) {
    return this.request(RPC_CMD.SUBSCRIBE, args, evt);
  }

  // Unsubscribe from RPC event
  async unsubscribe(evt, args = {}) {
    return this.request(RPC_CMD.UNSUBSCRIBE, args, evt);
  }

  // --- Voice Control Commands ---

  async getVoiceSettings() {
    const res = await this.request(RPC_CMD.GET_VOICE_SETTINGS);
    return res.data;
  }

  async setVoiceSettings(settings) {
    return this.request(RPC_CMD.SET_VOICE_SETTINGS, settings);
  }

  async toggleMute() {
    const settings = await this.getVoiceSettings();
    return this.setVoiceSettings({ mute: !settings.mute });
  }

  async toggleDeaf() {
    const settings = await this.getVoiceSettings();
    return this.setVoiceSettings({ deaf: !settings.deaf });
  }

  async setMute(mute) {
    return this.setVoiceSettings({ mute });
  }

  async setDeaf(deaf) {
    return this.setVoiceSettings({ deaf });
  }

  async setInputDevice(deviceId, volume) {
    const args = { input: { device_id: deviceId } };
    if (volume !== undefined) args.input.volume = volume;
    return this.setVoiceSettings(args);
  }

  async setOutputDevice(deviceId, volume) {
    const args = { output: { device_id: deviceId } };
    if (volume !== undefined) args.output.volume = volume;
    return this.setVoiceSettings(args);
  }

  async setInputVolume(volume) {
    return this.setVoiceSettings({ input: { volume } });
  }

  async setOutputVolume(volume) {
    return this.setVoiceSettings({ output: { volume } });
  }

  // --- Channel Commands ---

  async getGuilds() {
    const res = await this.request(RPC_CMD.GET_GUILDS);
    return res.data?.guilds || [];
  }

  async getChannels(guildId) {
    const res = await this.request(RPC_CMD.GET_CHANNELS, { guild_id: guildId });
    return res.data?.channels || [];
  }

  async getSelectedVoiceChannel() {
    const res = await this.request(RPC_CMD.GET_SELECTED_VOICE_CHANNEL);
    return res.data;
  }

  async selectVoiceChannel(channelId, force = false) {
    return this.request(RPC_CMD.SELECT_VOICE_CHANNEL, {
      channel_id: channelId,
      force
    });
  }

  async disconnectVoice() {
    return this.selectVoiceChannel(null);
  }

  async selectTextChannel(channelId) {
    return this.request(RPC_CMD.SELECT_TEXT_CHANNEL, { channel_id: channelId });
  }

  // --- User Volume ---

  async setUserVoiceSettings(userId, opts) {
    return this.request(RPC_CMD.SET_USER_VOICE_SETTINGS, {
      user_id: userId,
      ...opts
    });
  }

  async setUserVolume(userId, volume) {
    // Only send the volume field, do not include mute or pan
    return this.setUserVoiceSettings(userId, { volume });
  }

  async setUserMute(userId, mute) {
    // Only send the mute field, do not include volume or pan
    return this.setUserVoiceSettings(userId, { mute });
  }

  // --- Activity ---

  async setActivity(activity) {
    return this.request(RPC_CMD.SET_ACTIVITY, { pid: process.pid, activity });
  }

  // --- Event Handling ---

  on(event, handler) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, []);
    }
    this._eventHandlers.get(event).push(handler);
  }

  off(event, handler) {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }
  }

  _emit(event, data) {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(h => {
        try { h(data); } catch (e) { logger.error('Event handler error:', e.message); }
      });
    }
  }

  _once(event, handler) {
    const wrapped = (data) => {
      this.off(event, wrapped);
      handler(data);
    };
    this.on(event, wrapped);
  }

  // --- IPC Protocol ---

  _sendPacket(opcode, payload) {
    if (!this.socket) return;
    const data = JSON.stringify(payload);
    const buf = Buffer.alloc(8 + Buffer.byteLength(data));
    buf.writeUInt32LE(opcode, 0);
    buf.writeUInt32LE(Buffer.byteLength(data), 4);
    buf.write(data, 8);
    this.socket.write(buf);
  }

  _sendFrame(payload) {
    this._sendPacket(OP.FRAME, payload);
  }

  _onData(data) {
    this._buffer = Buffer.concat([this._buffer, data]);

    while (this._buffer.length >= 8) {
      const opcode = this._buffer.readUInt32LE(0);
      const length = this._buffer.readUInt32LE(4);

      if (this._buffer.length < 8 + length) break;

      const payload = this._buffer.subarray(8, 8 + length);
      this._buffer = this._buffer.subarray(8 + length);

      try {
        const msg = JSON.parse(payload.toString());
        this._handleFrame(opcode, msg);
      } catch (err) {
        logger.error('Failed to parse IPC frame:', err.message);
      }
    }
  }

  _handleFrame(opcode, msg) {
    switch (opcode) {
      case OP.FRAME: {
        // Check for pending request response
        if (msg.nonce && this._pendingRequests.has(msg.nonce)) {
          const { resolve, reject, timeout } = this._pendingRequests.get(msg.nonce);
          clearTimeout(timeout);
          this._pendingRequests.delete(msg.nonce);
          if (msg.evt === RPC_EVT.ERROR) {
            const err = new Error(msg.data?.message || 'Discord RPC error');
            err.code = msg.data?.code;
            err.data = msg.data;
            reject(err);
          } else {
            resolve(msg);
          }
        }

        // Emit as event
        if (msg.evt) {
          this._emit(msg.evt, msg);
          this._emit('event', msg);
        }

        this._emit('frame', msg);
        break;
      }

      case OP.CLOSE:
        logger.warn('Discord RPC closed:', msg);
        this._emit('close', msg);
        this.disconnect();
        break;

      case OP.PING:
        this._sendPacket(OP.PONG, msg);
        break;

      case OP.PONG:
        break;
    }
  }

  _onClose() {
    this.connected = false;
    this.authenticated = false;
    this.socket = null;
    logger.warn('Discord IPC disconnected');
    this._emit('disconnected');
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.authenticated = false;
    this._pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('Disconnected'));
    });
    this._pendingRequests.clear();
  }

  destroy() {
    clearTimeout(this._reconnectTimer);
    this.disconnect();
    this._eventHandlers.clear();
  }
}

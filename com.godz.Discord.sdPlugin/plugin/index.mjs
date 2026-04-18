// Godz Discord Plugin - Main Entry Point
// Initializes StreamDock SDK, Discord RPC, and all action handlers

import { StreamDockSDK } from './lib/streamdock.mjs';
import { DiscordRPC, RPC_EVT } from './lib/discord-rpc.mjs';
import { AuthServer } from './lib/auth-server.mjs';
import { logger } from './lib/logger.mjs';

// Action Handlers
import { MuteAction } from './actions/mute.mjs';
import { DeafAction } from './actions/deaf.mjs';
import { VoiceChannelAction } from './actions/voice-channel.mjs';
import { TextChannelAction } from './actions/text-channel.mjs';
import { NoticeAction } from './actions/notice.mjs';
import { UserVolumeAction } from './actions/user-volume.mjs';
import { SoundboardAction } from './actions/soundboard.mjs';
import { SetDevicesAction } from './actions/set-devices.mjs';
import { ToggleVideoAction } from './actions/toggle-video.mjs';
import { ScreenShareAction } from './actions/screen-share.mjs';
import { DisconnectAction } from './actions/disconnect.mjs';
import { NoiseSuppressionAction } from './actions/noise-suppression.mjs';
import { OpenLinkAction } from './actions/open-link.mjs';
// import { OpenDMAction } from './actions/open-dm.mjs';

// Bump SCOPE_VERSION whenever SCOPES change to force re-authorization
const SCOPE_VERSION = 3;

// Scopes for RPC AUTHORIZE command (must only include RPC-compatible scopes)
const SCOPES = [
  'identify',
  'rpc',
  'rpc.voice.read',
  'rpc.voice.write',
  'rpc.notifications.read',
  'messages.read'
];

// Extended scopes for browser OAuth2 (includes video/screenshare)
const BROWSER_SCOPES = [
  'identify',
  'rpc',
  'rpc.voice.read',
  'rpc.voice.write',
  'rpc.notifications.read',
  'rpc.video.write',
  'rpc.screenshare.write'
];

class GodzDiscordPlugin {
  constructor() {
    this.sdk = new StreamDockSDK();
    this.rpc = new DiscordRPC();
    this.authServer = new AuthServer();
    this.actions = {};
    this._reconnecting = false;
    this._connecting = false;

    // Encaminha eventos de nova DM para todas as instâncias de OpenDMAction
    // Removed OpenDMAction DM event handler
  }

  async init() {
    // Parse CLI args
    this.sdk.parseArgs(process.argv.slice(2));

    // Connect to StreamDock
    await this.sdk.connect();
    logger.info('Connected to StreamDock');

    // Start auth server
    try {
      await this.authServer.start();
    } catch (err) {
      logger.warn('Auth server failed to start (may be in use):', err.message);
    }

    // Register all action handlers
    this._registerActions();

    // Listen for global settings
    this.sdk.on('didReceiveGlobalSettings', (msg) => {
      const settings = msg.payload?.settings || {};
      logger.info('Global settings received:', JSON.stringify({
        hasClientId: !!settings.clientId,
        hasClientSecret: !!settings.clientSecret,
        hasAccessToken: !!settings.accessToken,
        keys: Object.keys(settings)
      }));
      this._onGlobalSettings(settings);
    });

    // Listen for sendToPlugin for auth commands
    this.sdk.on('sendToPlugin', (msg) => {
      logger.info('sendToPlugin received:', JSON.stringify(msg.payload));
      this._handlePluginMessage(msg);
    });

    // Setup Discord RPC event forwarding
    this._setupRPCEvents();

    logger.info('Godz Discord Plugin initialized');
  }

  _registerActions() {
    const actionMap = {
      'com.godz.discord.mute': MuteAction,
      'com.godz.discord.deaf': DeafAction,
      'com.godz.discord.voicechannel': VoiceChannelAction,
      'com.godz.discord.textchannel': TextChannelAction,
      'com.godz.discord.notice': NoticeAction,
      'com.godz.discord.userVolume': UserVolumeAction,
      'com.godz.discord.soundboard': SoundboardAction,
      'com.godz.discord.setDevices': SetDevicesAction,
      'com.godz.discord.toggleVideo': ToggleVideoAction,
      'com.godz.discord.screenShare': ScreenShareAction,
      'com.godz.discord.disconnect': DisconnectAction,
      'com.godz.discord.noiseSuppression': NoiseSuppressionAction,
      'com.godz.discord.openLink': OpenLinkAction,
      // OpenDMAction and CustomStatusAction removed
    };

    for (const [uuid, ActionClass] of Object.entries(actionMap)) {
      const action = new ActionClass(this.sdk, this.rpc);
      this.actions[uuid] = action;
      this.sdk.registerAction(uuid, action);
    }

    logger.info(`Registered ${Object.keys(actionMap).length} action handlers`);
  }

  _setupRPCEvents() {
    this.rpc.on('disconnected', () => {
      logger.warn('Discord RPC disconnected');
      this._scheduleReconnect();
    });

    this.rpc.on('ready', () => {
      logger.info('Discord RPC ready');
    });

    this.rpc.on('authenticated', () => {
      logger.info('Discord RPC authenticated');
      this._subscribeToEvents();
      this._broadcastConnectionStatus();
    });
  }

  async _subscribeToEvents() {
    const events = [
      RPC_EVT.VOICE_SETTINGS_UPDATE,
      RPC_EVT.VOICE_CHANNEL_SELECT,
      RPC_EVT.VOICE_CONNECTION_STATUS,
      RPC_EVT.SPEAKING_START,
      RPC_EVT.SPEAKING_STOP,
    ];

    for (const evt of events) {
      try {
        await this.rpc.subscribe(evt);
        logger.debug('Subscribed to:', evt);
      } catch (err) {
        logger.warn(`Failed to subscribe to ${evt}:`, err.message);
      }
    }

    try {
      await this.rpc.subscribe(RPC_EVT.NOTIFICATION_CREATE);
      logger.debug('Subscribed to: NOTIFICATION_CREATE');
    } catch (err) {
      logger.warn('Failed to subscribe to notifications:', err.message);
    }
  }

  async _onGlobalSettings(settings) {
    const { clientId, clientSecret, accessToken, scopeVersion } = settings;

    if (!clientId) {
      logger.info('No client ID configured');
      return;
    }

    // If scopes changed since last auth, invalidate token to force re-auth
    let effectiveToken = accessToken;
    if (accessToken && scopeVersion !== SCOPE_VERSION) {
      logger.warn(`Scope version mismatch (stored=${scopeVersion}, current=${SCOPE_VERSION}). Clearing token to re-authorize with new scopes.`);
      effectiveToken = null;
    }

    // Try to connect and authenticate (skip if already connecting/connected)
    if (!this.rpc.connected && !this._connecting) {
      await this._connectDiscord(clientId, clientSecret, effectiveToken);
    }
  }

  async _connectDiscord(clientId, clientSecret, accessToken) {
    if (this._connecting) {
      logger.info('Already connecting to Discord, skipping...');
      return;
    }
    this._connecting = true;
    try {
      logger.info('Connecting to Discord IPC with clientId:', clientId);
      await this.rpc.connect(clientId);
      logger.info('Discord IPC connected successfully');

      if (accessToken) {
        logger.info('Authenticating with existing access token...');
        try {
          await this.rpc.authenticate(accessToken);
          logger.info('Token authentication successful');
        } catch (err) {
          logger.warn('Token authentication failed, invalidando token e re-autorizando:', err.message);
          // Só apaga o token se realmente for inválido
          this.sdk.setGlobalSettings({
            ...this.sdk.globalSettings,
            accessToken: '',
          });
          await this._authorizeAndAuthenticate(clientId, clientSecret);
        }
      } else {
        logger.info('No access token, starting fresh authorization...');
        await this._authorizeAndAuthenticate(clientId, clientSecret);
      }
    } catch (err) {
      logger.error('Discord connection failed:', err.message);
      this._scheduleReconnect();
    } finally {
      this._connecting = false;
    }
  }

  async _authorizeAndAuthenticate(clientId, clientSecret) {
    try {
      logger.info('Starting Discord authorization via DEEP_LINK (browser OAuth2 implicit flow)...');

      // Use DEEP_LINK to open Discord's OAuth2 page with extended scopes
      // This gets a token with rpc.video.write + rpc.screenshare.write
      const scopeStr = BROWSER_SCOPES.join('+');
      const searchParams = `client_id=${clientId}&response_type=token&scope=${scopeStr}`;
      logger.info('DEEP_LINK OAuth2 scopes:', scopeStr);

      // Start listening for the token before sending DEEP_LINK
      const tokenPromise = this.authServer.waitForToken(120000);

      try {
        // Try DEEP_LINK first (opens OAuth2 in Discord's embedded browser)
        await this.rpc.request('DEEP_LINK', {
          type: 'OAUTH2',
          params: { search: searchParams }
        });
        logger.info('DEEP_LINK sent, waiting for user to authorize in Discord...');
      } catch (dlErr) {
        // DEEP_LINK failed, fallback to opening browser directly
        logger.warn('DEEP_LINK failed, opening browser fallback:', dlErr.message);
        const authUrl = `https://discord.com/oauth2/authorize?${searchParams}`;
        this.sdk.openUrl(authUrl);
        logger.info('Opened browser OAuth2 page:', authUrl);
      }

      // Wait for the token to come back via the callback page POST to /data
      const tokenData = await tokenPromise;
      const accessToken = tokenData.access_token;
      logger.info('Implicit OAuth2 token received, scope:', tokenData.scope || 'unknown');

      if (!accessToken) {
        logger.error('No access token in implicit OAuth2 response');
        return;
      }

      // Save the token
      this.sdk.setGlobalSettings({
        ...this.sdk.globalSettings,
        clientId,
        clientSecret,
        accessToken,
        tokenExpiry: Date.now() + ((tokenData.expires_in || 604800) * 1000),
        scopeVersion: SCOPE_VERSION
      });
      logger.info('Global settings saved with implicit OAuth2 token');

      // Authenticate RPC session with the new token
      logger.info('Authenticating with Discord using new token...');
      await this.rpc.authenticate(accessToken);
      logger.info('Discord authentication complete!');
    } catch (err) {
      logger.error('Authorization flow failed:', err.message);
      logger.error('Auth error stack:', err.stack);
    }
  }

  async _handlePluginMessage(msg) {
    const { payload, context, action } = msg;

    switch (payload?.command) {
            case 'authorize': {
        const { clientId, clientSecret } = payload;
        if (clientId && clientSecret) {
          this.sdk.setGlobalSettings({ clientId, clientSecret });
          await this._connectDiscord(clientId, clientSecret);
        }
        break;
      }

      case 'logout': {
        this.rpc.disconnect();
        this.sdk.setGlobalSettings({
          clientId: '',
          clientSecret: '',
          accessToken: '',
          refreshToken: ''
        });
        break;
      }

      case 'getConnectionStatus': {
        if (action && context) {
          this.sdk.sendToPropertyInspector(context, action, {
            command: 'connectionStatus',
            data: {
              connected: this.rpc.connected,
              authenticated: this.rpc.authenticated,
              user: this.rpc.user
            }
          });
        }
        break;
      }
    }
  }

  _broadcastConnectionStatus() {
    const status = {
      command: 'status',
      data: {
        connected: this.rpc.connected,
        authenticated: this.rpc.authenticated,
        user: this.rpc.user
      }
    };
    // Notify all active PI contexts
    for (const [context, data] of this.sdk.actions) {
      try {
        this.sdk.sendToPropertyInspector(context, data.action, status);
      } catch (e) { /* PI might not be open */ }
    }
    logger.info('Broadcasted connection status to all PIs');
  }

  _scheduleReconnect() {
    if (this._reconnecting) return;
    this._reconnecting = true;

    // Backoff inicial e máximo
    let backoff = this._reconnectBackoff || 5000;
    const maxBackoff = 60000;

    const tryReconnect = async () => {
      const { clientId, clientSecret, accessToken } = this.sdk.globalSettings;
      if (!clientId) {
        this._reconnecting = false;
        this._reconnectBackoff = 5000;
        return;
      }
      try {
        await this._connectDiscord(clientId, clientSecret, accessToken);
        // Sucesso: resetar backoff
        this._reconnecting = false;
        this._reconnectBackoff = 5000;
      } catch (err) {
        logger.warn(`Falha ao reconectar ao Discord: ${err.message}. Tentando novamente em ${Math.floor(backoff/1000)}s...`);
        this._reconnectBackoff = Math.min(backoff * 2, maxBackoff);
        setTimeout(tryReconnect, this._reconnectBackoff);
      }
    };

    setTimeout(tryReconnect, backoff);
  }
}

// Start the plugin
const plugin = new GodzDiscordPlugin();
plugin.init().catch(err => {
  logger.error('Plugin initialization failed:', err.message);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  plugin.rpc.destroy();
  plugin.authServer.stop();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return;
  logger.error('Uncaught exception:', err.message, err.stack);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err);
});
// Godz Discord Plugin - StreamDock SDK Bridge for Property Inspector
// Handles WebSocket communication between PI and StreamDock

let $websocket = null;
let $uuid = '';
let $action = '';
let $context = '';
let $settings = {};
let $globalSettings = {};
let $lang = {};
let $info = {};
let $connected = false;

// StreamDock entry point alias (some versions call connectSocket)
const connectSocket = connectElgatoStreamDeckSocket;

// Called by StreamDock when PI opens
function connectElgatoStreamDeckSocket(port, uuid, event, appInfo, actionInfo) {
  if ($connected || ($websocket && ($websocket.readyState === 0 || $websocket.readyState === 1))) {
    return;
  }

  $connected = true;
  $uuid = uuid;
  if (typeof appInfo === 'string') {
    try {
      $info = JSON.parse(appInfo || '{}');
    } catch (_) {
      $info = {};
    }
  } else {
    $info = appInfo || {};
  }

  if (actionInfo) {
    try {
      const ai = typeof actionInfo === 'string' ? JSON.parse(actionInfo) : actionInfo;
      $action = ai.action || '';
      $context = ai.context || '';
      $settings = (ai.payload && ai.payload.settings) || {};
    } catch (_) {
      $action = '';
      $context = '';
      $settings = {};
    }
  }

  if (!$action) {
    $action = _inferActionFromPath();
  }
  if (!$context) {
    $context = uuid || '';
  }

  // Connect WebSocket
  $websocket = new WebSocket(`ws://127.0.0.1:${port}`);

  $websocket.onopen = () => {
    // Register
    $websocket.send(JSON.stringify({ event, uuid }));

    // Early debug: signal that PI WebSocket connected
    try {
      $websocket.send(JSON.stringify({
        event: 'sendToPlugin',
        action: $action,
        context: $context,
        payload: { command: '_piConnected', action: $action, context: $context, hasUuid: !!uuid }
      }));
    } catch(e) { /* ignore */ }

    // Load global settings
    $websocket.getGlobalSettings();

    // Load localization
    _loadLocalization();

    // Notify PI
    if (typeof $propEvent !== 'undefined' && $propEvent.connected) {
      $propEvent.connected();
    }
  };

  $websocket.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      _handleMessage(msg);
    } catch (e) {
      console.error('PI message parse error:', e);
    }
  };

  $websocket.onclose = () => {
    $connected = false;
    console.log('PI WebSocket closed');
  };

  $websocket.onerror = () => {
    $connected = false;
  };
}

// Extend WebSocket with SDK methods
function _extendWebSocket() {
  if (!WebSocket.prototype._godzExtended) {
    WebSocket.prototype._godzExtended = true;

    WebSocket.prototype.getGlobalSettings = function () {
      this.send(JSON.stringify({ event: 'getGlobalSettings', context: $uuid }));
    };

    WebSocket.prototype.setGlobalSettings = function (settings) {
      $globalSettings = Object.assign({}, $globalSettings, settings || {});
      this.send(JSON.stringify({
        event: 'setGlobalSettings',
        context: $uuid,
        payload: $globalSettings
      }));
    };

    WebSocket.prototype.sendToPlugin = function (payload) {
      this.send(JSON.stringify({
        event: 'sendToPlugin',
        action: $action,
        context: $context || $uuid,
        payload
      }));
    };

    WebSocket.prototype.setSettings = function (settings) {
      this.send(JSON.stringify({
        event: 'setSettings',
        context: $context || $uuid,
        payload: settings
      }));
    };

    // Debounced settings save
    const _debouncedSave = $.debounce((target) => {
      if ($websocket && typeof $websocket.setSettings === 'function') {
        $websocket.setSettings(target);
      }
    }, 300);

    WebSocket.prototype.saveData = function (payload) {
      _debouncedSave(payload);
    };

    WebSocket.prototype.setState = function (state) {
      this.send(JSON.stringify({
        event: 'setState',
        context: $context,
        payload: { state }
      }));
    };

    WebSocket.prototype.setTitle = function (title, target = 0) {
      this.send(JSON.stringify({
        event: 'setTitle',
        context: $context,
        payload: { title: String(title), target }
      }));
    };

    WebSocket.prototype.setImage = function (image, target = 0) {
      this.send(JSON.stringify({
        event: 'setImage',
        context: $context,
        payload: { image, target }
      }));
    };

    WebSocket.prototype.openUrl = function (url) {
      this.send(JSON.stringify({
        event: 'openUrl',
        payload: { url }
      }));
    };
  }
}

_extendWebSocket();

// Setup auto-save proxy for $settings
function _createSettingsProxy(initial) {
  return new Proxy(initial, {
    set(target, property, value) {
      target[property] = value;
      if ($websocket && typeof $websocket.saveData === 'function') {
        $websocket.saveData(Object.assign({}, target));
      }
      return true;
    }
  });
}

// Handle incoming messages
function _handleMessage(msg) {
  // Debug: send all received events to plugin for logging
  try {
    if ($websocket && $websocket.readyState === 1 && msg.event !== 'sendToPropertyInspector') {
      $websocket.sendToPlugin({
        command: '_piDebug',
        event: msg.event,
        hasPayload: !!msg.payload,
        payloadKeys: msg.payload ? Object.keys(msg.payload) : [],
        hasSettings: !!(msg.payload && msg.payload.settings),
        settingsKeys: (msg.payload && msg.payload.settings) ? Object.keys(msg.payload.settings) : [],
        globalSettingsSnapshot: msg.event === 'didReceiveGlobalSettings' ? JSON.stringify(msg.payload).substring(0, 200) : undefined
      });
    }
  } catch(e) { /* ignore debug errors */ }

  switch (msg.event) {
    case 'didReceiveSettings':
      $settings = _createSettingsProxy((msg.payload && msg.payload.settings) || {});
      if (typeof $propEvent !== 'undefined' && $propEvent.didReceiveSettings) {
        $propEvent.didReceiveSettings(msg);
      }
      break;

    case 'didReceiveGlobalSettings':
      $globalSettings = (msg.payload && msg.payload.settings) || {};
      if (typeof $propEvent !== 'undefined' && $propEvent.didReceiveGlobalSettings) {
        $propEvent.didReceiveGlobalSettings({ settings: $globalSettings });
      }
      break;

    case 'sendToPropertyInspector':
      if (typeof $propEvent !== 'undefined' && $propEvent.sendToPropertyInspector) {
        $propEvent.sendToPropertyInspector(msg.payload);
      }
      break;
  }
}

// Load localization
async function _loadLocalization() {
  const lang = ($info && $info.application && $info.application.language) || 'en';
  try {
    const res = await fetch(`../../${lang}.json`);
    if (res.ok) {
      $lang = await res.json();
      _applyLocalization();
    }
  } catch (e) {
    console.warn('Localization load failed:', e);
  }
}

// Apply localization to DOM
function _applyLocalization() {
  if (!$lang.Localization) return;
  const loc = $lang.Localization;

  // Translate text nodes
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text && loc[text]) {
        node.textContent = node.textContent.replace(text, loc[text]);
      }
    }
    node.childNodes.forEach(walk);
  };
  walk(document.body);

  // Translate placeholders
  document.querySelectorAll('[placeholder]').forEach(el => {
    const ph = el.getAttribute('placeholder');
    if (loc[ph]) el.setAttribute('placeholder', loc[ph]);
  });
}

// Open authorization page - inline form (no iframe to avoid StreamDock PI close issue)
function openAuthorization() {
    // Ajuda oculta/mostra
    setTimeout(() => {
      const helpBtn = overlay.querySelector('#show-help-btn');
      const helpSection = overlay.querySelector('#help-section');
      if (helpBtn && helpSection) {
        helpBtn.onclick = function() {
          helpSection.style.display = helpSection.style.display === 'none' || helpSection.style.display === '' ? 'block' : 'none';
        };
        // Garante que o bloco começa oculto
        helpSection.style.display = 'none';
      }
      const devPortal = overlay.querySelector('#open-dev-portal');
      if (devPortal) {
        devPortal.onclick = function(e) {
          e.preventDefault();
          window.open('https://discord.com/developers/applications', '_blank');
        };
      }
    }, 100);
  // Don't open auth twice
  if (document.getElementById('godz-auth-overlay')) return;

  const main = $('.sdpi-wrapper');
  if (main) main.style.display = 'none';

  const langCode = (($info && $info.application && $info.application.language) || navigator.language || 'en');
  const isPt = langCode.startsWith('pt');

  const t = isPt ? {
    title: 'Autorização Discord',
    subtitle: 'Conecte seu Aplicativo Discord Developer',
    info: 'Para usar este plugin, você precisa de um Aplicativo Discord Developer.',
    devLink: 'Crie um em discord.com/developers',
    step1: 'Vá ao Discord Developer Portal',
    step2: 'Crie um Novo Aplicativo',
    step3: 'Vá em configurações OAuth2',
    step4: 'Adicione a URL de redirecionamento:',
    step5: 'Copie o Client ID e Client Secret abaixo',
    clientIdPh: 'Digite o Client ID',
    clientSecretPh: 'Digite o Client Secret',
    authorize: 'Autorizar',
    tutorial: 'Ver o tutorial'
  } : {
    title: 'Discord Authorization',
    subtitle: 'Connect your Discord Developer Application',
    info: 'To use this plugin, you need a Discord Developer Application.',
    devLink: 'Create one at discord.com/developers',
    step1: 'Go to Discord Developer Portal',
    step2: 'Create a New Application',
    step3: 'Go to OAuth2 settings',
    step4: 'Add redirect URL:',
    step5: 'Copy Client ID and Client Secret below',
    clientIdPh: 'Enter Client ID',
    clientSecretPh: 'Enter Client Secret',
    authorize: 'Authorize',
    tutorial: 'View the tutorial'
  };

  const overlay = document.createElement('div');
  overlay.id = 'godz-auth-overlay';
  overlay.innerHTML = `
    <div style="max-width:280px;margin:0 auto;padding:16px;">
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:11px;font-weight:600;color:#b5bac1;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">CLIENT ID</label>
        <input type="text" id="godz-client-id" placeholder="${t.clientIdPh}" autocomplete="off"
          style="width:100%;padding:8px 12px;background:#1e1f22;border:1px solid #3f4147;border-radius:4px;color:#f2f3f5;font-size:13px;outline:none;">
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:11px;font-weight:600;color:#b5bac1;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">CLIENT SECRET</label>
        <input type="password" id="godz-client-secret" placeholder="${t.clientSecretPh}" autocomplete="off"
          style="width:100%;padding:8px 12px;background:#1e1f22;border:1px solid #3f4147;border-radius:4px;color:#f2f3f5;font-size:13px;outline:none;">
      </div>
      <button id="show-help-btn" style="width:100%;margin:10px 0 0 0;padding:8px 0;background:#232428;color:#00a8fc;border:none;border-radius:4px;font-size:12px;cursor:pointer;">Como obter o Client ID/Secret?</button>
      <div id="help-section" style="display:none;background:#232428;border-radius:4px;padding:10px 12px;margin-top:8px;font-size:11px;color:#b5bac1;">
        <ol style="margin-bottom:8px;">
          <li>Acesse <a href="https://discord.com/developers/applications" id="open-dev-portal" target="_blank" style="color:#00a8fc;text-decoration:underline;">Discord Developer Portal</a></li>
          <li>Crie um Novo Aplicativo</li>
          <li>Vá em configurações OAuth2</li>
          <li>Adicione a URL de redirecionamento: <strong>http://127.0.0.1:26432/callback</strong></li>
          <li>Copie o Client ID e Client Secret abaixo</li>
        </ol>
        <span style="font-size:10px;color:#949ba4;">Dica: Clique no link acima para abrir o portal em uma nova aba.</span>
      </div>
      <button id="godz-auth-btn" disabled
        style="width:100%;padding:10px;background:#4752c4;opacity:0.5;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:not-allowed;margin-top:8px;">
        ${t.authorize}
      </button>
    </div>
  `;
  overlay.style.cssText = 'background:#1e1f22;position:absolute;top:0;left:0;width:100%;min-height:100%;z-index:9999;';
  document.body.appendChild(overlay);

  const cidInput = overlay.querySelector('#godz-client-id');
  const csInput = overlay.querySelector('#godz-client-secret');
  const authBtn = overlay.querySelector('#godz-auth-btn');
  const devLink = overlay.querySelector('#godz-dev-link');

  // ...existing code...

  // --- Validação do botão ---
  function validateAll() {
    authBtn.disabled = !(cidInput.value.trim() && csInput.value.trim());
    authBtn.style.opacity = authBtn.disabled ? 0.5 : 1;
    authBtn.style.cursor = authBtn.disabled ? 'not-allowed' : 'pointer';
  }
  cidInput.addEventListener('input', validateAll);
  csInput.addEventListener('input', validateAll);
  validateAll();

  // --- Autorizar ---
  authBtn.addEventListener('click', () => {
    const clientId = cidInput.value.trim();
    const clientSecret = csInput.value.trim();
    if (!clientId || !clientSecret) return;
    if ($websocket && typeof $websocket.setGlobalSettings === 'function') {
      $websocket.setGlobalSettings({ ...$globalSettings, clientId, clientSecret });
    }
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'authorize',
        clientId,
        clientSecret
      }, '*');
    }
  });
}

function _pickParam(params, hashParams, keys) {
  for (const key of keys) {
    const fromSearch = params.get(key);
    if (fromSearch) return fromSearch;
    const fromHash = hashParams.get(key);
    if (fromHash) return fromHash;
  }
  return '';
}

function _inferActionFromPath() {
  const path = (window.location.pathname || '').toLowerCase();
  const map = {
    '/mute/': 'com.godz.discord.mute',
    '/deaf/': 'com.godz.discord.deaf',
    '/voicechannel/': 'com.godz.discord.voicechannel',
    '/textchannel/': 'com.godz.discord.textchannel',
    '/notice/': 'com.godz.discord.notice',
    '/uservolume/': 'com.godz.discord.userVolume',
    '/volumecontrol/': 'com.godz.discord.volumeControl',
    '/soundboard/': 'com.godz.discord.soundboard',
    '/setdevices/': 'com.godz.discord.setDevices',
    '/pushtotalk/': 'com.godz.discord.pushToTalk',
    '/pushtomute/': 'com.godz.discord.pushToMute',
    '/togglevideo/': 'com.godz.discord.toggleVideo',
    '/screenshare/': 'com.godz.discord.screenShare',
    '/disconnect/': 'com.godz.discord.disconnect',
    '/noisesuppression/': 'com.godz.discord.noiseSuppression',
    '/customstatus/': 'com.godz.discord.customStatus'
  };

  for (const [segment, uuid] of Object.entries(map)) {
    if (path.includes(segment)) {
      return uuid;
    }
  }
  return '';
}

function _parseJsonMaybe(raw, fallback = '{}') {
  if (!raw) return fallback;
  try {
    const decoded = decodeURIComponent(raw);
    JSON.parse(decoded);
    return decoded;
  } catch (_) {
    try {
      JSON.parse(raw);
      return raw;
    } catch (__){
      return fallback;
    }
  }
}

function _tryAutoConnectFromUrl() {
  if ($connected || ($websocket && ($websocket.readyState === 0 || $websocket.readyState === 1))) {
    return;
  }

  try {
    const params = new URLSearchParams(window.location.search || '');
    const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));

    const port = window.location.port
      || _pickParam(params, hashParams, ['port', 'inPort']);

    if (!port) return;

    const uuid = _pickParam(params, hashParams, ['uuid', 'inUUID', 'pluginUUID']);
    const event = _pickParam(params, hashParams, ['event', 'inRegisterEvent', 'inMessageType'])
      || 'registerPropertyInspector';

    const appInfo = _parseJsonMaybe(_pickParam(params, hashParams, ['appInfo', 'inApplicationInfo']));
    const actionInfo = _parseJsonMaybe(_pickParam(params, hashParams, ['actionInfo', 'inActionInfo']));

    connectElgatoStreamDeckSocket(String(port), uuid, event, appInfo, actionInfo);
  } catch (_) {
    // Ignore fallback failures and wait for host callback.
  }
}

if (typeof window !== 'undefined') {
  window.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;
  window.connectSocket = connectElgatoStreamDeckSocket;
  window.connectStreamDeckSocket = connectElgatoStreamDeckSocket;
  window.connectRiseModeStreamDeckSocket = connectElgatoStreamDeckSocket;

  if (window.__godzPendingConnectArgs && window.__godzPendingConnectArgs.length >= 3) {
    const pending = Array.from(window.__godzPendingConnectArgs);
    window.__godzPendingConnectArgs = null;
    setTimeout(() => {
      connectElgatoStreamDeckSocket.apply(null, pending);
    }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(_tryAutoConnectFromUrl, 300);
      setTimeout(_tryAutoConnectFromUrl, 1200);
    });
  } else {
    setTimeout(_tryAutoConnectFromUrl, 300);
    setTimeout(_tryAutoConnectFromUrl, 1200);
  }
}



// Godz Discord Plugin - Screen Share Property Inspector
// Enhanced screen selection with monitors and windows

const $local = true, $back = false;

let monitors = [];
let windows = [];
let currentTab = 'monitors';
let _screenRetryTimer = null;
let _screenHintTimer = null;
let _hasScreenData = false;

const $dom = {
  main: $('.sdpi-wrapper'),
  logout: $('#logout'),
  logoutdiv: $('#logoutdiv'),
  monitorGrid: $('#monitorGrid'),
  windowList: $('#windowList'),
  windowSearch: $('#windowSearch'),
  selectedInfo: $('#selectedInfo'),
  selectedName: $('#selectedName'),
  refreshMonitors: $('#refreshMonitors'),
  refreshWindows: $('#refreshWindows'),
};

function showStatus(msg) {
  if (!$dom.statusMsg) {
    $dom.statusMsg = document.createElement('div');
    $dom.statusMsg.className = 'sdpi-item';
    $dom.statusMsg.style.cssText = 'color: #faa61a; font-size: 12px; text-align: center; padding: 8px;';
    $dom.main.insertBefore($dom.statusMsg, $dom.main.firstChild);
  }
  $dom.statusMsg.textContent = msg;
  $dom.statusMsg.style.display = msg ? '' : 'none';
}

function sendToPluginSafe(payload) {
  if (!$websocket) return;

  if (typeof $websocket.sendToPlugin === 'function') {
    $websocket.sendToPlugin(payload);
    return;
  }

  if ($websocket.readyState === 1) {
    $websocket.send(JSON.stringify({
      event: 'sendToPlugin',
      action: $action || 'com.godz.discord.screenShare',
      context: $context || $uuid,
      payload
    }));
  }
}

function requestScreens() {
  if (_screenRetryTimer) clearTimeout(_screenRetryTimer);
  if (_screenHintTimer) clearTimeout(_screenHintTimer);
  _screenHintTimer = setTimeout(() => {
    if (!_hasScreenData) showStatus('Loading screens...');
  }, 700);
  sendToPluginSafe({ command: 'getScreens' });
}

// --- Tab Switching ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    currentTab = target;
    document.getElementById(`tab-${target}`).classList.add('active');
  });
});

// --- Render Monitors ---
function renderMonitors() {
  if (monitors.length === 0) {
    $dom.monitorGrid.innerHTML = '<div class="empty-state">No monitors found</div>';
    return;
  }

  $dom.monitorGrid.innerHTML = monitors.map(m => `
    <div class="screen-card ${isSelected('monitor', m.id) ? 'selected' : ''}"
         data-type="monitor" data-id="${$.escapeHtml(m.id)}"
         data-name="${$.escapeHtml(m.displayName)}">
      <div class="screen-icon">🖥️</div>
      <div class="screen-name">${$.escapeHtml(m.displayName)}</div>
      <div class="screen-resolution">${m.width}×${m.height}</div>
      ${m.primary ? '<div class="screen-resolution" style="color: var(--discord-blurple);">Principal</div>' : ''}
    </div>
  `).join('');

  // Click handlers
  $dom.monitorGrid.querySelectorAll('.screen-card').forEach(card => {
    card.addEventListener('click', () => selectTarget(card));
  });
}

// --- Render Windows ---
function renderWindows() {
  const query = $dom.windowSearch?.value?.toLowerCase() || '';
  const filtered = query
    ? windows.filter(w =>
        w.title.toLowerCase().includes(query) ||
        w.name.toLowerCase().includes(query))
    : windows;

  if (filtered.length === 0) {
    $dom.windowList.innerHTML = '<div class="empty-state">No windows found</div>';
    return;
  }

  $dom.windowList.innerHTML = filtered.map(w => `
    <div class="window-item ${isSelected('window', w.id) ? 'selected' : ''}"
         data-type="window" data-id="${$.escapeHtml(w.id)}"
         data-name="${$.escapeHtml(w.displayName)}">
      <div class="win-icon">📋</div>
      <div class="win-info">
        <div class="win-title">${$.escapeHtml(w.title)}</div>
        <div class="win-process">${$.escapeHtml(w.name)}</div>
      </div>
    </div>
  `).join('');

  // Click handlers
  $dom.windowList.querySelectorAll('.window-item').forEach(item => {
    item.addEventListener('click', () => selectTarget(item));
  });
}

// --- Selection Logic ---
function isSelected(type, id) {
  return $settings.shareType === type && $settings.shareTarget === id;
}

function selectTarget(el) {
  const type = el.dataset.type;
  const id = el.dataset.id;
  const name = el.dataset.name;

  $settings.shareType = type;
  $settings.shareTarget = id;
  $settings.shareTargetName = name;

  // Update visual selection
  document.querySelectorAll('.screen-card, .window-item').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');

  // Update selected info display
  $dom.selectedInfo.style.display = 'block';
  $dom.selectedName.textContent = name;
  showStatus('');
}

function updateSelectedDisplay() {
  if ($settings.shareTarget && $settings.shareTargetName) {
    $dom.selectedInfo.style.display = 'block';
    $dom.selectedName.textContent = $settings.shareTargetName;
  } else {
    $dom.selectedInfo.style.display = 'none';
  }
}

// --- Event Handlers ---
const $propEvent = {
  didReceiveSettings(data) {
    $websocket.getGlobalSettings();
    updateSelectedDisplay();
  },

  didReceiveGlobalSettings({ settings }) {
    if (!settings.clientId || !settings.clientSecret) {
      openAuthorization();
    } else {
      $dom.main.style.display = '';
      $dom.logoutdiv.style.display = 'flex';
      _hasScreenData = monitors.length > 0 || windows.length > 0;
      if (_hasScreenData) showStatus('');
      requestScreens();
    }
  },

  sendToPropertyInspector(payload) {
    if (payload.command === 'screens') {
      monitors = payload.data.monitors || [];
      windows = payload.data.windows || [];
      _hasScreenData = monitors.length > 0 || windows.length > 0;
      if (_screenHintTimer) clearTimeout(_screenHintTimer);
      showStatus('');
      renderMonitors();
      renderWindows();
      updateSelectedDisplay();
    }
    if (payload.command === 'error') {
      showStatus('Error loading screens: ' + (payload.data || 'Unknown'));
      _screenRetryTimer = setTimeout(requestScreens, 3000);
      if (currentTab === 'monitors') {
        $dom.monitorGrid.innerHTML = '<div class="empty-state">Failed to load monitors</div>';
      } else {
        $dom.windowList.innerHTML = '<div class="empty-state">Failed to load windows</div>';
      }
    }
  }
};

// --- Refresh Buttons ---
$dom.refreshMonitors.addEventListener('click', () => {
  $dom.monitorGrid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  showStatus('Refreshing monitors...');
  sendToPluginSafe({ command: 'refreshScreens' });
});

$dom.refreshWindows.addEventListener('click', () => {
  $dom.windowList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  showStatus('Refreshing windows...');
  sendToPluginSafe({ command: 'refreshScreens' });
});

// --- Search ---
$dom.windowSearch.addEventListener('input', $.debounce(() => {
  renderWindows();
}, 200));

// --- Logout ---
$dom.logout.addEventListener('click', () => {
  sendToPluginSafe({ command: 'logout' });
  $websocket.setGlobalSettings({ clientId: '', clientSecret: '', accessToken: '' });
});

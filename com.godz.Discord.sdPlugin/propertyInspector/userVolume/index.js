// Hook para atualizar o usuário selecionado e notificar o plugin imediatamente
// Godz Discord Plugin - User Volume Property Inspector (compatível com postMessage)
window.addEventListener('DOMContentLoaded', function() {
  // Ao abrir o PI, sempre pede a lista de usuários para inicializar corretamente
  if (window.$websocket) {
    window.$websocket.sendToPlugin({ command: 'getVoiceUsers' });
  } else if (window.sendToPlugin) {
    window.sendToPlugin({ command: 'getVoiceUsers' });
  }
  const userSelect = document.getElementById('userSelect');
  if (!userSelect) return;
  let users = [];
  let currentUserId = '';
  let lastSelectedUserId = '';

  // Handler para receber lista de usuários do plugin via postMessage
  window.addEventListener('message', function(e) {
    if (e.data && e.data.command === 'voiceUsers') {
      users = e.data.data;
      // Use sempre o valor do settings mais recente
      const selectedId = (window.$settings && window.$settings.userId) || e.data.selectedUserId || '';
      // Centraliza tudo em $.populateSelect, filtrando self antes
      // Usa o selfId enviado pelo backend para filtrar o próprio usuário
      // Exibe todos os usuários sem filtrar selfId (para depuração)
      if (window.$ && $.populateSelect) {
        $.populateSelect(userSelect, users, 'id', 'username', selectedId);
      }
      lastSelectedUserId = selectedId;
      // Atualiza avatar imediatamente
      const avatarDiv = document.getElementById('userAvatarDiv');
      if (avatarDiv) {
        avatarDiv.innerHTML = '';
        const user = filteredUsers.find(u => u.id === selectedId);
        if (user && user.avatar) {
          const url = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
          const img = document.createElement('img');
          img.src = url;
          img.alt = user.username || 'avatar';
          img.style = 'width:48px;height:48px;border-radius:50%;margin:8px 0;';
          avatarDiv.appendChild(img);
        }
      }
    }
  });

  userSelect.addEventListener('change', function() {
    // Salva o novo usuário selecionado imediatamente nos settings
    const selectedUserId = userSelect.value;
    currentUserId = selectedUserId;
    lastSelectedUserId = selectedUserId;
    if (window.$websocket && window.$settings) {
      window.$settings.userId = selectedUserId;
      window.$websocket.setSettings(window.$settings);
      setTimeout(() => {
        window.$websocket.getSettings && window.$websocket.getSettings();
      }, 100);
    } else if (window.sendToPlugin) {
      // fallback para compatibilidade
      window.sendToPlugin({ command: 'setSettings', settings: { userId: selectedUserId } });
      setTimeout(() => {
        window.sendToPlugin({ command: 'getSettings' });
      }, 100);
    }
    // Atualiza avatar imediatamente ao trocar
    const avatarDiv = document.getElementById('userAvatarDiv');
    if (avatarDiv) {
      avatarDiv.innerHTML = '';
      const user = users.find(u => u.id === selectedUserId);
      if (user && user.avatar) {
        const url = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
        const img = document.createElement('img');
        img.src = url;
        img.alt = user.username || 'avatar';
        img.style = 'width:48px;height:48px;border-radius:50%;margin:8px 0;';
        avatarDiv.appendChild(img);
      }
    }
  });
});

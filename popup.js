const toggleBtn = document.getElementById('toggleExtensionBtn');
const statusMsg = document.getElementById('statusMessage');

// Функция обновления UI в зависимости от статуса
function updateUI(isEnabled) {
  if (isEnabled) {
    toggleBtn.textContent = 'Отключить';
    toggleBtn.classList.remove('off');
    statusMsg.innerHTML = '✅ Активен<br><span style="font-size:11px;">Орфография проверяется</span>';
  } else {
    toggleBtn.textContent = 'Включить';
    toggleBtn.classList.add('off');
    statusMsg.innerHTML = '⏸ Отключен<br><span style="font-size:11px;">Проверка приостановлена</span>';
  }
}

// Запрашиваем текущий статус у content.js
async function getStatus() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0] && tabs[0].id) {
    try {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' });
      if (response && typeof response.enabled !== 'undefined') {
        updateUI(response.enabled);
      }
    } catch (e) {
      console.log("Content script not ready yet");
    }
  }
}

// Отправляем команду на переключение
async function toggleExtension() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0] && tabs[0].id) {
    try {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleExtension' });
      if (response && typeof response.enabled !== 'undefined') {
        updateUI(response.enabled);
      }
    } catch (e) {
      console.log("Error toggling:", e);
    }
  }
}

toggleBtn.addEventListener('click', toggleExtension);

// При открытии попапа обновляем статус
getStatus();
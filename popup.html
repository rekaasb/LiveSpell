const toggleBtn = document.getElementById('toggleExtensionBtn');
const statusMsg = document.getElementById('statusMessage');

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

async function getStatus() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    try {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' });
      if (response && typeof response.enabled !== 'undefined') updateUI(response.enabled);
    } catch (e) {}
  }
}

async function toggleExtension() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    try {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleExtension' });
      if (response && typeof response.enabled !== 'undefined') updateUI(response.enabled);
    } catch (e) {}
  }
}

// Загрузка и отображение словаря
async function loadDictionary() {
  const result = await chrome.storage.local.get(['customDictionary']);
  const dict = result.customDictionary || [];
  const dictCount = document.getElementById('dictCount');
  const dictList = document.getElementById('dictList');
  
  if (dictCount) dictCount.textContent = dict.length;
  
  if (dictList) {
    if (dict.length === 0) {
      dictList.innerHTML = '<div style="color: #999; text-align: center;">Словарь пуст</div>';
    } else {
      dictList.innerHTML = dict.map(word => 
        `<div class="dict-word">📖 ${escapeHtml(word)}</div>`
      ).join('');
    }
  }
}

// Очистка словаря
async function clearDictionary() {
  if (confirm('Очистить весь пользовательский словарь?')) {
    await chrome.storage.local.set({ customDictionary: [] });
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      try {
        await chrome.tabs.sendMessage(tabs[0].id, { action: 'clearDictionary' });
      } catch(e) {}
    }
    loadDictionary();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

toggleBtn.addEventListener('click', toggleExtension);

const clearDictBtn = document.getElementById('clearDictBtn');
if (clearDictBtn) clearDictBtn.addEventListener('click', clearDictionary);

getStatus();
loadDictionary();

// Обновляем словарь при открытии (на случай изменений на других вкладках)
setInterval(loadDictionary, 2000);

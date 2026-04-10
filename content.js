// ========== ОСНОВНЫЕ ФУНКЦИИ CoreSpell ==========
let isCheckerActive = false;
let originalHTML = '';
let errorCache = new Map();
let customDictionary = new Set();
let currentLang = 'ru';
let isEnabled = true; // Флаг, включено ли расширение
const SPELLER_API = 'https://speller.yandex.net/services/spellservice.json/checkTexts';

// Функция проверки текста через API
async function checkTextWithAPI(texts) {
  try {
    const formData = new URLSearchParams();
    texts.forEach(text => {
      formData.append('text', text);
    });
    
    const response = await fetch(SPELLER_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData
    });
    
    if (!response.ok) throw new Error('API request failed');
    const results = await response.json();
    return results;
  } catch (error) {
    console.error('Check error:', error);
    return [];
  }
}

// Экранирование HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ========== МОДУЛЬ ЖИВОЙ ПРОВЕРКИ ==========
let activeFields = new WeakMap();
let isReplacing = false;

async function checkInputField(field) {
  if (isReplacing) {
    console.log('⏸️ Пропускаем проверку (идёт замена)');
    return;
  }
  
  console.log('📝 Проверка поля:', field);
  
  let text = '';
  if (field.isContentEditable) {
    text = field.innerText;
  } else if (field.tagName === 'TEXTAREA' || (field.tagName === 'INPUT' && (field.type === 'text' || field.type === 'search'))) {
    text = field.value;
  } else {
    return;
  }
  
  if (!text || text.length < 2) return;
  
  console.log('🔍 Отправка текста в API:', text.substring(0, 50));
  
  if (field.isContentEditable) {
    clearFieldHighlights(field);
  }
  
  const results = await checkTextWithAPI([text]);
  if (!results[0] || results[0].length === 0) {
    field.style.border = '';
    field.style.backgroundColor = '';
    return;
  }
  
  console.log('✅ Найдены ошибки:', results[0].length);
  highlightErrorsInInputField(field, text, results[0]);
}

function clearFieldHighlights(field) {
  if (field.isContentEditable) {
    const wrapper = field.querySelector('.livespell-wrapper');
    if (wrapper) {
      const original = wrapper.getAttribute('data-original');
      if (original !== null) {
        while (field.firstChild) {
  field.removeChild(field.firstChild);
}
field.appendChild(document.createTextNode(original));
      }
      field.normalize();
    }
  }
}

function highlightErrorsInInputField(field, originalText, errors) {
  if (!field.isContentEditable) {
    const errorWords = errors.map(e => ({
      word: originalText.substring(e.pos, e.pos + e.len),
      suggestions: e.s.slice(0, 3)
    }));
    
    if (errorWords.length > 0) {
      console.log('⚠️ Найдены ошибки:', errorWords);
      showNotification(field, errorWords);
    } else {
      field.style.border = '';
      field.style.backgroundColor = '';
    }
    return;
  }
  
  let modifiedText = originalText;
  const sortedErrors = [...errors].sort((a, b) => b.pos - a.pos);
  
  sortedErrors.forEach(error => {
    const errorWord = originalText.substring(error.pos, error.pos + error.len);
    const suggestions = error.s.join(', ');
    const before = modifiedText.substring(0, error.pos);
    const after = modifiedText.substring(error.pos + error.len);
    modifiedText = before + 
      `<span class="livespell-error" data-word="${escapeHtml(errorWord)}" data-suggestions="${escapeHtml(suggestions)}">${escapeHtml(errorWord)}</span>` + 
      after;
  });
  
 const wrapper = document.createElement('div');
wrapper.className = 'livespell-wrapper';
wrapper.setAttribute('data-original', originalText);

// Безопасное создание HTML через DOMParser
const parser = new DOMParser();
const doc = parser.parseFromString(modifiedText, 'text/html');
const fragment = document.createDocumentFragment();
while (doc.body.firstChild) {
  fragment.appendChild(doc.body.firstChild);
}
wrapper.appendChild(fragment);

const selection = window.getSelection();
const range = selection.getRangeCount() > 0 ? selection.getRangeAt(0) : null;

// Безопасная очистка поля (вместо innerHTML)
while (field.firstChild) {
  field.removeChild(field.firstChild);
}
field.appendChild(wrapper);
  
  if (range && field.contains(range.commonAncestorContainer)) {
    try {
      selection.removeAllRanges();
      selection.addRange(range);
    } catch(e) {}
  }
}

function initLiveSpell() {
	if (!isEnabled) {
  console.log('LiveSpell отключен пользователем');
  return;
}
  const selectors = [
    'textarea',
    'input[type="text"]',
    'input[type="search"]',
    'input[type="email"]',
    'input[type="password"]',
    'input:not([type])',
    '[contenteditable="true"]',
    '[contenteditable=""]',
    '.input',
    '[role="textbox"]'
  ];
  
  let fields = [];
  selectors.forEach(selector => {
    try {
      const found = document.querySelectorAll(selector);
      if (found.length > 0) {
        fields = [...fields, ...found];
      }
    } catch(e) {}
  });
  
  fields = [...new Set(fields)];
  console.log('🔍 initLiveSpell: найдено полей', fields.length);
  
  fields.forEach(field => {
    if (activeFields.has(field)) return;
    
    let timeoutId;
    const handler = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => checkInputField(field), 600);
    };
    
    field.addEventListener('input', handler);
    field.addEventListener('blur', () => {
      clearTimeout(timeoutId);
      checkInputField(field);
    });
    
    activeFields.set(field, handler);
    console.log('✅ Добавлен слушатель на поле', field.tagName, field.placeholder || field.id || field.name || '');
  });
}

const liveObserver = new MutationObserver((mutations) => {
  let shouldUpdate = false;
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      shouldUpdate = true;
      break;
    }
  }
  if (shouldUpdate) {
    setTimeout(() => initLiveSpell(), 500);
  }
});

if (document.body) {
  liveObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function start() {
  console.log('🚀 LiveSpell starting...');
  initLiveSpell();
  setInterval(() => {
    initLiveSpell();
  }, 3000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

document.addEventListener('click', (e) => {
  const errorSpan = e.target.closest('.livespell-error');
  if (errorSpan) {
    const word = errorSpan.getAttribute('data-word');
    const suggestions = errorSpan.getAttribute('data-suggestions');
    if (word && suggestions) {
      alert(`Ошибка: "${word}"\nПредложения: ${suggestions}`);
    }
  }
});

function saveDictionary() {
  chrome.storage.local.set({ customDictionary: Array.from(customDictionary) });
}

chrome.storage.local.get(['customDictionary', 'language'], (result) => {
  if (result.customDictionary) {
    customDictionary = new Set(result.customDictionary);
  }
  if (result.language) {
    currentLang = result.language;
  }
  console.log('Loaded language:', currentLang);
});

// ========== ФУНКЦИЯ УВЕДОМЛЕНИЙ (без innerHTML) ==========
function showNotification(field, errors) {
  if (!isEnabled) return;
  
  const oldNote = document.querySelector('.livespell-notification');
  if (oldNote) oldNote.remove();
  
  const rect = field.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;
  
  let topPos;
  if (spaceBelow < 200 && spaceAbove > 150) {
    topPos = rect.top - 10;
  } else {
    topPos = rect.bottom + 5;
  }
  
  let leftPos = rect.left;
  if (leftPos + 300 > window.innerWidth) {
    leftPos = window.innerWidth - 310;
  }
  if (leftPos < 10) leftPos = 10;
  
  const note = document.createElement('div');
  note.className = 'livespell-notification';
  
  const container = document.createElement('div');
  container.style.cssText = `background:#ff4444; color:white; padding:8px 12px; border-radius:8px; position:fixed; top:${topPos}px; left:${leftPos}px; z-index:10000; font-family:Arial; font-size:13px; box-shadow:0 2px 10px rgba(0,0,0,0.2); max-width:300px;`;
  
  const title = document.createElement('strong');
  title.textContent = '⚠️ Орфографические ошибки:';
  container.appendChild(title);
  container.appendChild(document.createElement('br'));
  
  errors.forEach(error => {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'margin-bottom: 8px; padding: 4px; background: rgba(255,255,255,0.15); border-radius: 6px;';
    
    const wordSpan = document.createElement('strong');
    wordSpan.style.cssText = 'background: white; color: #333; padding: 2px 8px; border-radius: 4px;';
    wordSpan.textContent = error.word;
    errorDiv.appendChild(wordSpan);
    
    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.style.marginTop = '6px';
    
    error.suggestions.forEach(sug => {
      const sugSpan = document.createElement('span');
      sugSpan.className = 'error-word';
      sugSpan.setAttribute('data-word', error.word);
      sugSpan.setAttribute('data-suggestion', sug);
      sugSpan.style.cssText = 'cursor: pointer; text-decoration: underline; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 4px; margin: 0 4px; display: inline-block;';
      sugSpan.textContent = sug;
    // Добавляем обработчик напрямую, с задержкой, чтобы DOM точно создался
setTimeout(() => {
  const spanElement = sugSpan; // сохраняем ссылку
  spanElement.onclick = function(event) {
    event.stopPropagation();
    event.preventDefault();
    
    const originalWord = spanElement.getAttribute('data-word');
    const suggestion = spanElement.getAttribute('data-suggestion');
    
    console.log(`🔧 [onclick] Замена: "${originalWord}" → "${suggestion}"`);
    
    isReplacing = true;
    
    // Для обычных полей
    if (!field.isContentEditable) {
      const oldValue = field.value;
      const newValue = oldValue.replace(originalWord, suggestion);
      
      if (newValue !== oldValue) {
        field.value = newValue;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.style.border = '';
        field.style.backgroundColor = '';
        if (note.parentNode) note.remove();
        console.log(`✅ Исправлено: "${newValue}"`);
      } else {
        console.log(`❌ Не найдено: "${originalWord}"`);
      }
      isReplacing = false;
    }
  };
}, 10);
      suggestionsDiv.appendChild(sugSpan);
    });
    
    errorDiv.appendChild(suggestionsDiv);
    container.appendChild(errorDiv);
  });
  
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:10px; margin-top:8px; opacity:0.8;';
  hint.textContent = '✏️ Кликните на вариант, чтобы исправить';
  container.appendChild(hint);
  
  note.appendChild(container);
  document.body.appendChild(note);
  
  field.style.border = '2px solid #ff4444';
  field.style.backgroundColor = '#fff8f8';
  field.style.transition = 'all 0.3s';
  
  field.addEventListener('focus', () => {
    field.style.border = '';
    field.style.backgroundColor = '';
    if (note.parentNode) note.remove();
  }, { once: true });
  
  setTimeout(() => {
    if (note.parentNode) {
      note.remove();
      field.style.border = '';
      field.style.backgroundColor = '';
    }
  }, 8000);
}
// ========== ОБРАБОТЧИК СООБЩЕНИЙ ОТ POPUP ==========
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'changeLanguage') {
    currentLang = request.language;
    console.log('Language changed to:', currentLang);
    sendResponse({ success: true });
  } else if (request.action === 'ping') {
    sendResponse({ status: 'alive', liveMode: true, enabled: isEnabled });
  } else if (request.action === 'getStatus') {
    // Возвращаем текущее состояние (включено/выключено)
    sendResponse({ enabled: isEnabled });
  } else if (request.action === 'toggleExtension') {
    // Переключаем состояние
    isEnabled = !isEnabled;
    console.log(`LiveSpell toggled: ${isEnabled ? 'ON' : 'OFF'}`);
    
    if (!isEnabled) {
      // Если выключили — убираем все уведомления и подсветки
      const note = document.querySelector('.livespell-notification');
      if (note) note.remove();
      
      // Убираем красную рамку со всех полей
      document.querySelectorAll('[style*="#ff4444"]').forEach(el => {
        el.style.border = '';
        el.style.backgroundColor = '';
      });
    } else {
      // Если включили — перезапускаем поиск полей
      initLiveSpell();
    }
    sendResponse({ enabled: isEnabled });
  }
  return true; // Важно! Означает, что ответ будет отправлен асинхронно
});
// ========== ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ДЛЯ СЛОЖНЫХ РЕДАКТОРОВ ==========
document.body.addEventListener('click', function(event) {
  const target = event.target.closest('.error-word');
  if (!target) return;
  
  event.stopPropagation();
  event.preventDefault();
  
  const originalWord = target.getAttribute('data-word');
  const suggestion = target.getAttribute('data-suggestion');
  const note = target.closest('.livespell-notification');
  
  console.log(`🌍 [global] Замена: "${originalWord}" → "${suggestion}"`);
  
  // Находим поле ввода (ищем активный элемент или поле с красной рамкой)
  let field = document.activeElement;
  if (!field || (field.tagName !== 'INPUT' && field.tagName !== 'TEXTAREA' && !field.isContentEditable)) {
    field = document.querySelector('[style*="border: 2px solid rgb(255, 68, 68)"]');
  }
  
  if (!field) {
    console.log('❌ Поле не найдено');
    return;
  }
  
  console.log(`📝 Поле:`, field.tagName, field.isContentEditable ? '(contenteditable)' : '');
  
  // Для contenteditable (чат DeepSeek)
    // СПЕЦИАЛЬНО ДЛЯ DEEPSEEK И АНАЛОГИЧНЫХ ЧАТОВ
  if (field.isContentEditable && field.closest('[data-testid="chat-input"]')) {
    console.log('🎯 Обнаружен чат DeepSeek, пробуем специальный метод');
    
    // Находим все текстовые узлы и заменяем в них слово
    const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) {
      if (walker.currentNode.textContent.includes(originalWord)) {
        textNodes.push(walker.currentNode);
      }
    }
    
    textNodes.forEach(node => {
      node.textContent = node.textContent.replace(new RegExp(originalWord, 'g'), suggestion);
    });
    
    // Триггерим событие для React
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Убираем подсветку
    field.style.border = '';
    field.style.backgroundColor = '';
    if (note) note.remove();
    
    console.log(`✅ Исправлено (спец. метод): "${originalWord}" → "${suggestion}"`);
    return; // Выходим, чтобы не выполнять остальной код
  }
    // Если специальный метод для DeepSeek уже сработал, то до сюда не дойдёт
  // Потому что там есть return. А если не сработал — пробуем обычный способ
  if (field.isContentEditable) {
    const currentText = field.innerText;
    const newText = currentText.replace(originalWord, suggestion);
    
    if (newText !== currentText) {
      field.innerText = newText;
      field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
      field.style.border = '';
      field.style.backgroundColor = '';
      if (note) note.remove();
      console.log(`✅ Исправлено (contenteditable): "${newText}"`);
    } else {
      console.log(`❌ Не найдено "${originalWord}" в "${currentText}"`);
    }
  } else if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
    const newValue = field.value.replace(originalWord, suggestion);
    if (newValue !== field.value) {
      field.value = newValue;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.style.border = '';
      field.style.backgroundColor = '';
      if (note) note.remove();
      console.log(`✅ Исправлено (input): "${newValue}"`);
    }
  }
});
console.log('🔥 LiveSpell FULLY LOADED with enhanced field detection');
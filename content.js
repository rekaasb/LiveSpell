// ========== ОСНОВНЫЕ ФУНКЦИИ CoreSpell ==========
let isCheckerActive = false;
let originalHTML = '';
let errorCache = new Map();
let customDictionary = new Set();
let currentLang = 'ru';
let isEnabled = true;
const SPELLER_API = 'https://speller.yandex.net/services/spellservice.json/checkTexts';

async function checkTextWithAPI(texts) {
  try {
    const formData = new URLSearchParams();
    texts.forEach(text => formData.append('text', text));
    const response = await fetch(SPELLER_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });
    if (!response.ok) throw new Error('API request failed');
    return await response.json();
  } catch (error) {
    console.error('Check error:', error);
    return [];
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ========== МОДУЛЬ ЖИВОЙ ПРОВЕРКИ ==========
let activeFields = new WeakMap();
let isReplacing = false;

async function checkInputField(field) {
  if (isReplacing) {
    console.log('⏸️ Пропускаем проверку (идёт замена)');
    return;
  }
  
  let text = '';
  if (field.isContentEditable) text = field.innerText;
  else if (field.tagName === 'TEXTAREA' || (field.tagName === 'INPUT' && (field.type === 'text' || field.type === 'search'))) text = field.value;
  else return;
  
  if (!text || text.length < 2) return;
  console.log('🔍 Отправка текста в API:', text.substring(0, 50));
  
  if (field.isContentEditable) clearFieldHighlights(field);
  
  const results = await checkTextWithAPI([text]);
  if (!results[0] || results[0].length === 0) {
    field.style.border = '';
    field.style.backgroundColor = '';
    return;
  }
  
  highlightErrorsInInputField(field, text, results[0]);
}

function clearFieldHighlights(field) {
  if (field.isContentEditable) {
    const wrapper = field.querySelector('.livespell-wrapper');
    if (wrapper) {
      const original = wrapper.getAttribute('data-original');
      if (original !== null) {
        while (field.firstChild) field.removeChild(field.firstChild);
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
      const filteredErrors = errorWords.filter(e => !customDictionary.has(e.word.toLowerCase()));
      if (filteredErrors.length > 0) {
        console.log('⚠️ Найдены ошибки (после фильтрации словаря):', filteredErrors);
        showNotification(field, filteredErrors);
      } else {
        field.style.border = '';
        field.style.backgroundColor = '';
      }
    }
    return;
  }
  
  // Contenteditable обработка
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
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(modifiedText, 'text/html');
  const fragment = document.createDocumentFragment();
  while (doc.body.firstChild) fragment.appendChild(doc.body.firstChild);
  wrapper.appendChild(fragment);
  
  const selection = window.getSelection();
  const range = selection.getRangeCount() > 0 ? selection.getRangeAt(0) : null;
  
  while (field.firstChild) field.removeChild(field.firstChild);
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
  
  const selectors = ['textarea', 'input[type="text"]', 'input[type="search"]', 'input[type="email"]', 'input[type="password"]', 'input:not([type])', '[contenteditable="true"]', '[contenteditable=""]', '.input', '[role="textbox"]'];
  let fields = [];
  selectors.forEach(selector => {
    try {
      const found = document.querySelectorAll(selector);
      if (found.length) fields = [...fields, ...found];
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
  });
}

const liveObserver = new MutationObserver(() => {
  setTimeout(() => initLiveSpell(), 500);
});
if (document.body) liveObserver.observe(document.body, { childList: true, subtree: true });

function start() {
  console.log('🚀 LiveSpell starting...');
  initLiveSpell();
  setInterval(() => initLiveSpell(), 3000);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

function saveDictionary() {
  chrome.storage.local.set({ customDictionary: Array.from(customDictionary) });
}

chrome.storage.local.get(['customDictionary', 'language'], (result) => {
  if (result.customDictionary) customDictionary = new Set(result.customDictionary);
  if (result.language) currentLang = result.language;
  console.log('Loaded dictionary:', customDictionary.size, 'words');
});

// ========== ФУНКЦИЯ УВЕДОМЛЕНИЙ (с кнопкой "В словарь") ==========
function showNotification(field, errors) {
  if (!isEnabled) return;
  
  const oldNote = document.querySelector('.livespell-notification');
  if (oldNote) oldNote.remove();
  
  const rect = field.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;
  
  let topPos = (spaceBelow < 200 && spaceAbove > 150) ? rect.top - 10 : rect.bottom + 5;
  let leftPos = rect.left;
  if (leftPos + 300 > window.innerWidth) leftPos = window.innerWidth - 310;
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
    
    // Варианты исправлений
    error.suggestions.forEach(sug => {
      const sugSpan = document.createElement('span');
      sugSpan.className = 'error-word';
      sugSpan.setAttribute('data-word', error.word);
      sugSpan.setAttribute('data-suggestion', sug);
      sugSpan.style.cssText = 'cursor: pointer; text-decoration: underline; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 4px; margin: 0 4px; display: inline-block;';
      sugSpan.textContent = sug;
      
      sugSpan.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const originalWord = sugSpan.getAttribute('data-word');
        const suggestion = sugSpan.getAttribute('data-suggestion');
        
        isReplacing = true;
        if (!field.isContentEditable) {
          const newValue = field.value.replace(originalWord, suggestion);
          if (newValue !== field.value) {
            field.value = newValue;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.style.border = '';
            field.style.backgroundColor = '';
            if (note.parentNode) note.remove();
          }
        }
        isReplacing = false;
      };
      suggestionsDiv.appendChild(sugSpan);
    });
    
    // Кнопка "Добавить в словарь" (одна на слово)
    const addToDictSpan = document.createElement('span');
    addToDictSpan.textContent = '📚';
    addToDictSpan.title = 'Добавить слово в словарь (больше не будет подчёркиваться)';
    addToDictSpan.style.cssText = 'cursor: pointer; background: rgba(255,255,255,0.3); padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-size: 12px;';
    addToDictSpan.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const wordToAdd = error.word.toLowerCase();
      customDictionary.add(wordToAdd);
      saveDictionary();
      
      const confirmMsg = document.createElement('span');
      confirmMsg.textContent = '✓ Добавлено!';
      confirmMsg.style.cssText = 'margin-left: 8px; font-size: 11px;';
      addToDictSpan.parentNode.insertBefore(confirmMsg, addToDictSpan.nextSibling);
      addToDictSpan.style.display = 'none';
      
      setTimeout(() => {
        if (note.parentNode) checkInputField(field);
      }, 300);
      console.log(`📚 Слово "${wordToAdd}" добавлено в словарь`);
    };
    suggestionsDiv.appendChild(addToDictSpan);
    
    errorDiv.appendChild(suggestionsDiv);
    container.appendChild(errorDiv);
  });
  
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:10px; margin-top:8px; opacity:0.8;';
  hint.textContent = '✏️ Кликните на вариант, чтобы исправить | 📚 Кликните на книгу, чтобы добавить в словарь';
  container.appendChild(hint);
  
  note.appendChild(container);
  document.body.appendChild(note);
  
  field.style.border = '2px solid #ff4444';
  field.style.backgroundColor = '#fff8f8';
  
  // Закрытие при клике вне уведомления
  const closeHandler = (e) => {
    if (note && note.contains(e.target)) return;
    field.style.border = '';
    field.style.backgroundColor = '';
    if (note && note.parentNode) note.remove();
    document.removeEventListener('click', closeHandler);
  };
  document.addEventListener('click', closeHandler);
  
  field.addEventListener('focus', () => {
    field.style.border = '';
    field.style.backgroundColor = '';
    if (note.parentNode) note.remove();
    document.removeEventListener('click', closeHandler);
  }, { once: true });
  
  setTimeout(() => {
    if (note.parentNode) {
      note.remove();
      field.style.border = '';
      field.style.backgroundColor = '';
    }
  }, 8000);
}

// ========== ОБРАБОТЧИК СООБЩЕНИЙ ==========
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'changeLanguage') {
    currentLang = request.language;
    sendResponse({ success: true });
  } else if (request.action === 'ping') {
    sendResponse({ status: 'alive', enabled: isEnabled });
  } else if (request.action === 'getStatus') {
    sendResponse({ enabled: isEnabled });
  } else if (request.action === 'toggleExtension') {
    isEnabled = !isEnabled;
    if (!isEnabled) {
      const note = document.querySelector('.livespell-notification');
      if (note) note.remove();
      document.querySelectorAll('[style*="#ff4444"]').forEach(el => {
        el.style.border = '';
        el.style.backgroundColor = '';
      });
    } else {
      initLiveSpell();
    }
    sendResponse({ enabled: isEnabled });
  } else if (request.action === 'clearDictionary') {
    customDictionary.clear();
    saveDictionary();
    console.log('📚 Словарь очищен');
    sendResponse({ success: true });
  } else if (request.action === 'getDictionary') {
    sendResponse({ dictionary: Array.from(customDictionary) });
  }
  return true;
});

console.log('🔥 LiveSpell FULLY LOADED');

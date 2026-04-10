// background.js для Chrome (минимальная версия)
console.log('LiveSpell background service worker started');

// Просто слушаем установку
chrome.runtime.onInstalled.addListener(() => {
  console.log('LiveSpell installed');
});
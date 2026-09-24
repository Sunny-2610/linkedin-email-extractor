'use strict';
// MV3 service worker: no DOM. Keeps defaults, no keys stored here.
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    chrome.storage.local.get(['settings'], function (res) {
      if (!res.settings) {
        chrome.storage.local.set({
          settings: { primaryProvider: 'apollo', fallbackProvider: 'hunter', fallbackEnabled: true }
        });
      }
    });
  }
});

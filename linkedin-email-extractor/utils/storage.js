'use strict';
// Storage layer (FR-06, Sec 13): chrome.storage.local only. No logging of keys.
var LCE = window.LCE || {};
LCE.storage = (function () {
  function get(keys, defaults) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(keys, function (res) {
          resolve(Object.assign({}, defaults, res));
        });
      } catch (e) { resolve(defaults || {}); }
    });
  }
  function set(obj) {
    return new Promise(function (resolve) {
      try { chrome.storage.local.set(obj, function () { resolve(); }); }
      catch (e) { resolve(); }
    });
  }
  function remove(keys) {
    return new Promise(function (resolve) {
      try { chrome.storage.local.remove(keys, function () { resolve(); }); }
      catch (e) { resolve(); }
    });
  }
  function getSettings() {
    return get(['settings'], {}).then(function (r) {
      return Object.assign(
        { primaryProvider: 'apollo', fallbackProvider: 'hunter', fallbackEnabled: true },
        r.settings || {}
      );
    });
  }
  function saveSettings(s) { return set({ settings: s }); }
  function getKeys() {
    return get(['credentials'], {}).then(function (r) {
      return Object.assign({ apolloApiKey: '', hunterApiKey: '' }, r.credentials || {});
    });
  }
  function saveKeys(c) { return set({ credentials: c }); }
  return { get: get, set: set, remove: remove, getSettings: getSettings, saveSettings: saveSettings, getKeys: getKeys, saveKeys: saveKeys };
})();
window.LCE = LCE;

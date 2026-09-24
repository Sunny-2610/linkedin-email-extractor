'use strict';
/* Options: FR-04/05/06/07 + Sec 12 — provider selection, keys, test, remove. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var primaryProvider = $('primaryProvider'), fallbackProvider = $('fallbackProvider'), fallbackEnabled = $('fallbackEnabled');
  var apolloKey = $('apolloKey'), hunterKey = $('hunterKey');

  function set(id, msg, kind) {
    var el = $(id);
    el.textContent = msg || '';
    el.classList.remove('error', 'ok', 'neutral');
    el.classList.add(kind || 'neutral');
  }

  function load() {
    LCE.storage.getSettings().then(function (s) {
      primaryProvider.value = s.primaryProvider;
      fallbackProvider.value = s.fallbackProvider;
      fallbackEnabled.checked = !!s.fallbackEnabled;
    });
    LCE.storage.getKeys().then(function (k) {
      apolloKey.value = k.apolloApiKey || '';
      hunterKey.value = k.hunterApiKey || '';
    });
  }

  $('saveSettingsBtn').addEventListener('click', function () {
    LCE.storage.saveSettings({
      primaryProvider: primaryProvider.value,
      fallbackProvider: fallbackProvider.value,
      fallbackEnabled: fallbackEnabled.checked
    }).then(function () { set('settingsStatus', 'Settings saved', 'ok'); });
  });

  $('saveApolloBtn').addEventListener('click', function () {
    LCE.storage.getKeys().then(function (k) {
      k.apolloApiKey = apolloKey.value.trim();
      LCE.storage.saveKeys(k).then(function () { set('apolloStatus', 'Apollo key saved locally', 'ok'); });
    });
  });
  $('removeApolloBtn').addEventListener('click', function () {
    apolloKey.value = '';
    LCE.storage.getKeys().then(function (k) { k.apolloApiKey = ''; LCE.storage.saveKeys(k).then(function () { set('apolloStatus', 'Apollo key removed', 'ok'); }); });
  });
  $('testApolloBtn').addEventListener('click', function () {
    set('apolloStatus', 'Testing API key…', 'neutral');
    LCE.providers.apollo.validateCredentials(apolloKey.value.trim()).then(function (r) {
      set('apolloStatus', (r.ok ? '✓ ' : '✕ ') + r.message, r.ok ? 'ok' : 'error');
    });
  });

  $('saveHunterBtn').addEventListener('click', function () {
    LCE.storage.getKeys().then(function (k) {
      k.hunterApiKey = hunterKey.value.trim();
      LCE.storage.saveKeys(k).then(function () { set('hunterStatus', 'Hunter key saved locally', 'ok'); });
    });
  });
  $('removeHunterBtn').addEventListener('click', function () {
    hunterKey.value = '';
    LCE.storage.getKeys().then(function (k) { k.hunterApiKey = ''; LCE.storage.saveKeys(k).then(function () { set('hunterStatus', 'Hunter key removed', 'ok'); }); });
  });
  $('testHunterBtn').addEventListener('click', function () {
    set('hunterStatus', 'Testing API key…', 'neutral');
    LCE.providers.hunter.validateCredentials(hunterKey.value.trim()).then(function (r) {
      set('hunterStatus', (r.ok ? '✓ ' : '✕ ') + r.message, r.ok ? 'ok' : 'error');
    });
  });

  $('clearAllBtn').addEventListener('click', function () {
    apolloKey.value = ''; hunterKey.value = '';
    LCE.storage.saveKeys({ apolloApiKey: '', hunterApiKey: '' }).then(function () {
      set('apolloStatus', 'Removed', 'ok'); set('hunterStatus', 'Removed', 'ok');
    });
  });

  load();
})();

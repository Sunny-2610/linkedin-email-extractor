'use strict';
/* Popup: FR-01..17 — detect, enrich via provider manager, render normalized result. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var detectStatus = $('detectStatus'), profileBox = $('profileBox');
  var profileName = $('profileName'), profileMeta = $('profileMeta'), profileUrl = $('profileUrl');
  var visibleEmails = $('visibleEmails'), visiblePhones = $('visiblePhones');
  var domainInput = $('domainInput'), findBtn = $('findBtn'), freeGuessBtn = $('freeGuessBtn');
  var progress = $('progress'), resultBox = $('resultBox');
  var emailValue = $('emailValue'), emailStatus = $('emailStatus');
  var phoneValue = $('phoneValue'), phoneNote = $('phoneNote'), providerUsed = $('providerUsed');
  var copyEmailBtn = $('copyEmailBtn'), copyPhoneBtn = $('copyPhoneBtn'), copyAllBtn = $('copyAllBtn');
  var freeGuessOut = $('freeGuessOut'), fallbackNote = $('fallbackNote');

  var scan = { isProfile: false, profile: null, emails: [], phones: [] };
  var lastResult = null;

  function set(el, msg, kind) {
    el.textContent = msg || '';
    el.classList.remove('error', 'ok', 'neutral');
    el.classList.add(kind || 'neutral');
  }

  function renderList(ul, items, emptyText) {
    ul.innerHTML = '';
    if (!items.length) {
      var li = document.createElement('li');
      li.className = 'empty'; li.textContent = emptyText;
      ul.appendChild(li); return;
    }
    items.forEach(function (v) {
      var li = document.createElement('li');
      var s = document.createElement('span'); s.textContent = v;
      var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Copy';
      b.addEventListener('click', function () {
        LCE.clipboard.copyText(v).then(function () { set(detectStatus, 'Copied: ' + v, 'ok'); });
      });
      li.appendChild(s); li.appendChild(b); ul.appendChild(li);
    });
  }

  function selectedProvider() {
    var r = document.querySelector('input[name="provider"]:checked');
    return r ? r.value : 'apollo';
  }

  function activeTab() {
    return chrome.tabs.query({ active: true, currentWindow: true }).then(function (t) { return t[0]; });
  }

  function scanInlineFallback() {
    var RE = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    var emails = new Set();
    document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
      var m = a.href.match(/mailto:([^?&]+)/i);
      if (m) emails.add(decodeURIComponent(m[1]).trim());
    });
    var h1 = document.querySelector('main h1, h1');
    return { isProfile: true, emails: Array.from(emails), phones: [], profile: { name: h1 ? h1.innerText.trim() : '', linkedinUrl: location.href } };
  }

  function doDetect() {
    set(detectStatus, 'Checking page…', 'neutral');
    return activeTab().then(function (tab) {
      if (!tab || !tab.url || !/^https:\/\/(www\.)?linkedin\.com\/in\//i.test(tab.url)) {
        set(detectStatus, 'No LinkedIn profile detected. Open an individual LinkedIn profile to continue.', 'error');
        return null;
      }
      return chrome.tabs.sendMessage(tab.id, { type: 'SCAN' }).catch(function () {
        return chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanInlineFallback })
          .then(function (res) { return (res[0] && res[0].result) || null; })
          .catch(function () { return null; });
      }).then(function (data) {
        if (!data) { set(detectStatus, 'Could not scan this page. Refresh LinkedIn and retry.', 'error'); return null; }
        scan = data;
        if (data.isProfile === false) {
          set(detectStatus, 'This page is not a supported LinkedIn profile.', 'error');
          return null;
        }
        set(detectStatus, 'LinkedIn profile detected', 'ok');
        var p = data.profile || {};
        profileBox.classList.remove('hidden');
        profileName.textContent = p.name || 'Unknown name';
        var meta = [];
        if (p.title || p.headline) meta.push(p.title || p.headline);
        if (p.company) meta.push('@ ' + p.company);
        profileMeta.textContent = meta.join(' ');
        profileUrl.textContent = p.linkedinUrl || '';
        renderList(visibleEmails, data.emails || [], 'No visible email');
        renderList(visiblePhones, data.phones || [], 'No visible phone');
        if (p.company && !domainInput.value && window.LCE && LCE.providers && LCE.providers.local) {
          LCE.providers.local.suggestDomain(p.company).then(function (d) { if (d) domainInput.value = d; });
        }
        return data;
      });
    });
  }

  function doFind() {
    if (!scan.profile) { set(progress, 'Open a LinkedIn profile first.', 'error'); return; }
    Promise.all([LCE.storage.getSettings(), LCE.storage.getKeys()]).then(function (res) {
      var settings = Object.assign({}, res[0], { primaryProvider: selectedProvider() });
      var keys = res[1];
      var pid = settings.primaryProvider;
      var key = pid === 'apollo' ? keys.apolloApiKey : keys.hunterApiKey;
      if (!key) { set(progress, 'No API key configured. Open Settings to add your ' + pid + ' API key.', 'error'); return; }
      set(progress, 'Finding contact information… This may consume credits from your ' + pid + ' account.', 'neutral');
      findBtn.disabled = true;
      LCE.providerManager.enrich(scan.profile, keys, settings, { domain: domainInput.value.trim().toLowerCase() })
        .then(function (out) {
          findBtn.disabled = false;
          if (out.error) { set(progress, out.error, 'error'); resultBox.classList.add('hidden'); return; }
          lastResult = out.result;
          renderResult(out);
          set(progress, 'Enrichment complete' + (out.usedFallback ? ' (via fallback: ' + out.result.metadata.source + ')' : ''), 'ok');
        });
    });
  }

  function renderResult(out) {
    var res = out.result;
    resultBox.classList.remove('hidden');
    var em = (res.email && res.email.value) || '';
    var ph = (res.phone && res.phone.value) || '';
    emailValue.textContent = em || 'Not available';
    copyEmailBtn.disabled = !em;
    var st = res.email && res.email.status;
    emailStatus.textContent = em ? (st === 'verified' || st === 'valid' ? 'Verified' : st ? String(st) : '') : 'Not available from provider';
    phoneValue.textContent = ph || 'Not available from provider';
    copyPhoneBtn.disabled = !ph;
    phoneNote.textContent = ph ? '' : 'The extension does not claim no phone exists — only that the provider returned none.';
    providerUsed.textContent = 'Provider: ' + (res.metadata && res.metadata.source || out.primary) + (out.usedFallback ? ' (fallback)' : '');
  }

  function doFreeGuess() {
    if (!scan.profile) { set(freeGuessOut, 'Scan a profile first.', 'error'); return; }
    var domain = domainInput.value.trim().toLowerCase();
    if (!domain) { set(freeGuessOut, 'Enter company domain first (e.g. acme.com).', 'error'); return; }
    set(freeGuessOut, 'Guessing pattern (free, unverified)…', 'neutral');
    LCE.providers.local.enrichPerson(scan.profile, null, { domain: domain }).then(function (res) {
      lastResult = res;
      set(freeGuessOut, 'Best guess: ' + res.email.value + ' (' + res.email.pattern + ', ~' + res.email.confidence + '%) — ' + res.email.evidence, 'ok');
    }).catch(function (err) {
      set(freeGuessOut, LCE.providerManager.friendlyError(err), 'error');
    });
  }

  function copyAllText() {
    if (!lastResult) return '';
    var p = lastResult.person || scan.profile || {};
    return [p.name, p.title, p.company, p.linkedinUrl, lastResult.email && lastResult.email.value, lastResult.phone && lastResult.phone.value]
      .filter(Boolean).join('\n');
  }

  $('settingsBtn').addEventListener('click', function () { chrome.runtime.openOptionsPage(); });
  findBtn.addEventListener('click', doFind);
  freeGuessBtn.addEventListener('click', doFreeGuess);
  copyEmailBtn.addEventListener('click', function () {
    if (lastResult && lastResult.email.value) LCE.clipboard.copyText(lastResult.email.value).then(function () { set(progress, 'Copied', 'ok'); });
  });
  copyPhoneBtn.addEventListener('click', function () {
    if (lastResult && lastResult.phone.value) LCE.clipboard.copyText(lastResult.phone.value).then(function () { set(progress, 'Copied', 'ok'); });
  });
  copyAllBtn.addEventListener('click', function () {
    var t = copyAllText();
    if (t) LCE.clipboard.copyText(t).then(function () { set(progress, 'Copied', 'ok'); });
  });

  LCE.storage.getSettings().then(function (s) {
    var r = document.querySelector('input[name="provider"][value="' + s.primaryProvider + '"]');
    if (r) r.checked = true;
    fallbackNote.textContent = s.fallbackEnabled ? 'Fallback to ' + s.fallbackProvider + ' is on.' : '';
  });
  doDetect();
})();

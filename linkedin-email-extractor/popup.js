'use strict';

var statusEl = document.getElementById('status');
var emailsEl = document.getElementById('emails');
var phonesEl = document.getElementById('phones');
var scanBtn = document.getElementById('scanBtn');
var copyAllBtn = document.getElementById('copyAllBtn');
var profileBox = document.getElementById('profileBox');
var profileName = document.getElementById('profileName');
var profileMeta = document.getElementById('profileMeta');
var domainInput = document.getElementById('domainInput');
var hunterKeyInput = document.getElementById('hunterKey');
var enrichBtn = document.getElementById('enrichBtn');
var saveKeyBtn = document.getElementById('saveKeyBtn');
var enrichStatus = document.getElementById('enrichStatus');
var enrichResult = document.getElementById('enrichResult');

var state = { emails: [], phones: [], profile: null };

function setStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', !!isError);
  statusEl.classList.toggle('neutral', !isError);
}

function setEnrichStatus(msg, isError) {
  enrichStatus.textContent = msg || '';
  enrichStatus.classList.toggle('error', !!isError);
  enrichStatus.classList.toggle('neutral', !isError);
}

function copy(text, doneMsg) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(
    function () { setStatus(doneMsg || ('Copied: ' + text)); },
    function () { setStatus('Copy failed (clipboard blocked). Try again.', true); }
  );
}

function renderList(ul, items, emptyText, copyPrefix) {
  ul.innerHTML = '';
  if (!items || items.length === 0) {
    var li = document.createElement('li');
    li.className = 'empty';
    li.textContent = emptyText;
    ul.appendChild(li);
    return;
  }
  items.forEach(function (item) {
    var li = document.createElement('li');
    var span = document.createElement('span');
    span.textContent = item;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.addEventListener('click', function () { copy(item, (copyPrefix || 'Copied: ') + item); });
    li.appendChild(span);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function render(data) {
  state.emails = (data.emails || []).filter(Boolean);
  state.phones = (data.phones || []).filter(Boolean);
  state.profile = data.profile || null;

  if (state.profile && (state.profile.name || state.profile.company)) {
    profileBox.classList.remove('hidden');
    profileName.textContent = state.profile.name || 'Unknown name';
    var meta = [];
    if (state.profile.headline) meta.push(state.profile.headline);
    if (state.profile.company) meta.push('@ ' + state.profile.company);
    profileMeta.textContent = meta.join(' ');
  } else {
    profileBox.classList.add('hidden');
  }

  renderList(emailsEl, state.emails, 'No visible email. Try Enrich below for company pattern guess.', 'Copied: ');
  renderList(phonesEl, state.phones, 'No visible phone. Hidden mobiles cannot be guessed free.', 'Copied: ');

  var total = state.emails.length + state.phones.length;
  copyAllBtn.disabled = total === 0;
  if (total > 0) setStatus(total + ' visible item(s) found (Contact Info auto-opened).');
  else setStatus('No visible results. Check Contact Info or use Enrich.');

  // Auto-suggest domain via Clearbit if we have a company but no domain yet.
  if (state.profile && state.profile.company && !domainInput.value) {
    suggestDomain(state.profile.company);
  }
}

function scanInlineFallback() {
  var RE = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  var PH = /(\+?\d[\d\s\-.\(\)]{6,}\d)/g;
  var emails = new Set();
  var phones = new Set();
  document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
    var m = a.href.match(/mailto:([^?&]+)/i);
    if (m) emails.add(decodeURIComponent(m[1]).trim());
  });
  document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
    var m = a.href.match(/tel:([^?&]+)/i);
    if (m) phones.add(decodeURIComponent(m[1]).trim());
  });
  var raw = document.body ? document.body.innerText : '';
  var m;
  var re = new RegExp(RE.source, 'g');
  while ((m = re.exec(raw)) !== null) emails.add(m[1]);
  var rp = new RegExp(PH.source, 'g');
  while ((m = rp.exec(raw)) !== null) {
    if (m[1].replace(/\D/g, '').length >= 7) phones.add(m[1].trim());
  }
  var h1 = document.querySelector('main h1, h1');
  return {
    emails: Array.from(emails),
    phones: Array.from(phones),
    profile: { name: h1 ? h1.innerText.trim() : '', firstName: '', lastName: '', company: '', profileUrl: location.href }
  };
}

async function doScan() {
  setStatus('Scanning (opening Contact Info)…');
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];

  if (!tab || !tab.url || !/^https:\/\/(www\.)?linkedin\.com\/in\//i.test(tab.url)) {
    setStatus('Open a LinkedIn profile (linkedin.com/in/…) first.', true);
    return;
  }

  try {
    var resp = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN' });
    render(resp || { emails: [], phones: [] });
  } catch (e) {
    try {
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scanInlineFallback
      });
      render(results && results[0] && results[0].result ? results[0].result : { emails: [], phones: [] });
    } catch (err) {
      setStatus('Could not scan this page. Refresh LinkedIn and retry.', true);
    }
  }
}

// --- Free enrichment helpers ---

async function suggestDomain(company) {
  try {
    var r = await fetch('https://autocomplete.clearbit.com/v1/companies/suggest?query=' + encodeURIComponent(company));
    var j = await r.json();
    if (j && j[0] && j[0].domain) {
      domainInput.value = j[0].domain;
      setEnrichStatus('Suggested domain: ' + j[0].domain + ' (verify before use).');
    }
  } catch (e) { /* offline or blocked — user can type manually */ }
}

function splitName(profile) {
  if (!profile) return { first: '', last: '' };
  if (profile.firstName && profile.lastName) return { first: profile.firstName, last: profile.lastName };
  var parts = (profile.name || '').split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.length > 1 ? parts[parts.length - 1] : '' };
}

async function doEnrich() {
  enrichResult.innerHTML = '';
  var domain = (domainInput.value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  var key = (hunterKeyInput.value || '').trim();
  if (!domain) { setEnrichStatus('Enter company domain first (e.g. acme.com).', true); return; }
  var nm = splitName(state.profile);
  if (!nm.first || !nm.last) { setEnrichStatus('Scan a profile first so we have first + last name.', true); return; }
  if (!key) {
    setEnrichStatus('No Hunter key — showing unverified pattern guesses. Add free key for verification.', false);
    renderGuesses(nm, domain);
    return;
  }
  setEnrichStatus('Asking Hunter Email Finder (free 50/mo)…');
  try {
    var url = 'https://api.hunter.io/v2/email-finder?domain=' + encodeURIComponent(domain) +
      '&first_name=' + encodeURIComponent(nm.first) + '&last_name=' + encodeURIComponent(nm.last) +
      '&api_key=' + encodeURIComponent(key);
    var r = await fetch(url);
    var j = await r.json();
    if (r.status === 429) { setEnrichStatus('Hunter quota exhausted (429). Showing unverified guess instead.', true); renderGuesses(nm, domain); return; }
    if (j && j.data && j.data.email) {
      var email = j.data.email;
      var score = j.data.score;
      var status = j.data.verification ? j.data.verification.status : 'unknown';
      renderList(enrichResult, [email + '  — score ' + score + ' / ' + status], '', 'Copied: ');
      setEnrichStatus('Hunter: ' + status + ', confidence ' + score + '. Only use if legitimate interest.');
    } else {
      setEnrichStatus('Hunter found nothing (free?). Showing pattern guess.', true);
      renderGuesses(nm, domain);
    }
  } catch (e) {
    setEnrichStatus('Hunter call failed. Showing unverified guess.', true);
    renderGuesses(nm, domain);
  }
}

function renderGuesses(nm, domain) {
  var f = nm.first.toLowerCase().replace(/[^a-z]/g, '');
  var l = nm.last.toLowerCase().replace(/[^a-z]/g, '');
  if (!f || !l) return;
  var guesses = [
    f + '.' + l + '@' + domain,
    f + l + '@' + domain,
    f.charAt(0) + l + '@' + domain
  ];
  renderList(enrichResult, guesses, '', 'Copied guess: ');
}

scanBtn.addEventListener('click', doScan);
copyAllBtn.addEventListener('click', function () {
  copy(state.emails.concat(state.phones).join('\n'), 'Copied all visible items.');
});
enrichBtn.addEventListener('click', doEnrich);
saveKeyBtn.addEventListener('click', async function () {
  await chrome.storage.local.set({ hunterKey: hunterKeyInput.value.trim() });
  setEnrichStatus('Key saved locally in this browser only.');
});

// Load saved key + auto-scan
chrome.storage.local.get('hunterKey', function (res) {
  if (res && res.hunterKey) hunterKeyInput.value = res.hunterKey;
});
doScan();

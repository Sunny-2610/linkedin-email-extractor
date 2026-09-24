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
var enrichBtn = document.getElementById('enrichBtn');
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
    span.textContent = item.label || item;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Copy';
    var raw = item.value || item;
    btn.addEventListener('click', function () { copy(raw, (copyPrefix || 'Copied: ') + raw); });
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

  renderList(emailsEl, state.emails, 'No visible email. Try Find email below.', 'Copied: ');
  renderList(phonesEl, state.phones, 'No visible phone. Hidden mobiles cannot be guessed free.', 'Copied: ');

  var total = state.emails.length + state.phones.length;
  copyAllBtn.disabled = total === 0;
  if (total > 0) setStatus(total + ' visible item(s) found (Contact Info auto-opened).');
  else setStatus('No visible results. Check Contact Info or use Find email.');

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

// --- No-key free enrichment ---

async function suggestDomain(company) {
  try {
    var r = await fetch('https://autocomplete.clearbit.com/v1/companies/suggest?query=' + encodeURIComponent(company));
    var j = await r.json();
    if (j && j[0] && j[0].domain) {
      domainInput.value = j[0].domain;
      setEnrichStatus('Suggested domain: ' + j[0].domain + ' (verify before use).');
    }
  } catch (e) { /* user can type manually */ }
}

function splitName(profile) {
  if (!profile) return { first: '', last: '' };
  if (profile.firstName && profile.lastName) return { first: profile.firstName, last: profile.lastName };
  var parts = (profile.name || '').split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.length > 1 ? parts[parts.length - 1] : '' };
}

function clean(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

// 12 corporate templates, ordered by real-world frequency
var TEMPLATES = [
  'first.last', 'firstlast', 'flast', 'first', 'first.l',
  'first_last', 'f.last', 'last.first', 'last', 'fl', 'lastf', 'lastfirst'
];

function applyTemplate(t, f, l) {
  switch (t) {
    case 'first.last': return f + '.' + l;
    case 'firstlast': return f + l;
    case 'flast': return f.charAt(0) + l;
    case 'first': return f;
    case 'first.l': return f + '.' + l.charAt(0);
    case 'first_last': return f + '_' + l;
    case 'f.last': return f.charAt(0) + '.' + l;
    case 'last.first': return l + '.' + f;
    case 'last': return l;
    case 'fl': return f.charAt(0) + l.charAt(0);
    case 'lastf': return l + f.charAt(0);
    case 'lastfirst': return l + f;
    default: return f + '.' + l;
  }
}

function detectPattern(samples) {
  // samples: [{name, email}] where email domain already matches
  var scores = TEMPLATES.map(function (t) { return { template: t, hits: 0, total: 0 }; });
  samples.forEach(function (s) {
    var nameParts = (s.name || '').split(/\s+/).filter(Boolean);
    if (nameParts.length < 2) return;
    var f = clean(nameParts[0]);
    var l = clean(nameParts[nameParts.length - 1]);
    if (!f || !l) return;
    var local = (s.email.split('@')[0] || '').toLowerCase();
    if (!local) return;
    scores.forEach(function (sc) {
      sc.total++;
      if (applyTemplate(sc.template, f, l) === local) sc.hits++;
    });
  });
  scores.forEach(function (sc) {
    sc.conf = sc.total > 0 ? sc.hits / sc.total : 0;
  });
  scores.sort(function (a, b) {
    if (b.conf !== a.conf) return b.conf - a.conf;
    return b.hits - a.hits;
  });
  return scores;
}

function fetchWithTimeout(url, ms, opts) {
  var ctrl = new AbortController();
  var id = setTimeout(function () { ctrl.abort(); }, ms || 8000);
  return fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal })).finally(function () {
    clearTimeout(id);
  });
}

async function githubSamples(domain) {
  // Free, no key, CORS-enabled. 10 req/min unauth.
  try {
    var url = 'https://api.github.com/search/commits?q=author-email%3A%40' + encodeURIComponent(domain) + '&per_page=30';
    var r = await fetchWithTimeout(url, 9000, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return [];
    var j = await r.json();
    var out = [];
    (j.items || []).forEach(function (it) {
      var a = it.commit && it.commit.author;
      if (a && a.email && a.name && a.email.toLowerCase().endsWith('@' + domain)) {
        out.push({ name: a.name, email: a.email.toLowerCase() });
      }
    });
    return out;
  } catch (e) { return []; }
}

async function websiteEmails(domain) {
  // Best-effort: many sites block CORS, we just ignore failures.
  var urls = ['https://' + domain, 'https://www.' + domain, 'https://' + domain + '/contact', 'https://' + domain + '/about'];
  var found = new Set();
  var RE = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  for (var i = 0; i < urls.length; i++) {
    try {
      var r = await fetchWithTimeout(urls[i], 7000);
      if (!r.ok) continue;
      var t = await r.text();
      var m;
      var re = new RegExp(RE.source, 'g');
      while ((m = re.exec(t)) !== null) {
        var em = m[1].toLowerCase();
        if (em.endsWith('@' + domain) && em.length < 100) found.add(em);
      }
      if (found.size >= 5) break;
    } catch (e) { /* CORS / offline — skip */ }
  }
  return Array.from(found);
}

async function hasMX(domain) {
  try {
    var r = await fetchWithTimeout('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX', 7000);
    var j = await r.json();
    return !!(j.Answer && j.Answer.length > 0);
  } catch (e) { return null; } // unknown
}

async function doEnrich() {
  enrichResult.innerHTML = '';
  var domain = (domainInput.value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (!domain || domain.indexOf('.') < 0) { setEnrichStatus('Enter company domain first (e.g. acme.com).', true); return; }
  var nm = splitName(state.profile);
  var f = clean(nm.first);
  var l = clean(nm.last);
  if (!f || !l) { setEnrichStatus('Scan a profile first so we have first + last name.', true); return; }

  setEnrichStatus('Finding pattern (GitHub + website + MX)… no key needed.');
  enrichBtn.disabled = true;

  var gh = await githubSamples(domain);
  var web = await websiteEmails(domain);
  var mx = await hasMX(domain);

  // Build name-email pairs: GitHub gives name+email; website gives email-only (structural hint)
  var patternScores = detectPattern(gh);
  var top = patternScores[0];
  var usedPattern = 'first.last';
  var evidence = 'default (no public samples)';
  var confidence = 40;

  if (top && top.total >= 2 && top.conf >= 0.5) {
    usedPattern = top.template;
    evidence = top.hits + '/' + top.total + ' GitHub samples match ' + usedPattern;
    confidence = top.total >= 5 && top.conf >= 0.8 ? 75 : 60;
  } else if (web.length > 0) {
    // Structural fallback: dots vs underscores
    var dots = web.filter(function (e) { return e.split('@')[0].indexOf('.') >= 0; }).length;
    usedPattern = dots >= web.length / 2 ? 'first.last' : 'firstlast';
    evidence = web.length + ' public website email(s), structural guess';
    confidence = 50;
  }

  if (mx === false) {
    setEnrichStatus('Domain ' + domain + ' has no MX records — cannot receive mail. Check domain.', true);
    enrichBtn.disabled = false;
    return;
  }

  var primary = applyTemplate(usedPattern, f, l) + '@' + domain;
  // Two alternates: next-best templates different from primary
  var alts = [];
  patternScores.slice(0, 5).forEach(function (sc) {
    var cand = applyTemplate(sc.template, f, l) + '@' + domain;
    if (cand !== primary && alts.length < 2 && (sc.hits > 0 || sc.template === 'firstlast' || sc.template === 'flast')) {
      alts.push(cand);
    }
  });
  if (alts.length === 0) {
    ['first.last', 'firstlast', 'flast'].forEach(function (t) {
      var cand = applyTemplate(t, f, l) + '@' + domain;
      if (cand !== primary && alts.length < 2) alts.push(cand);
    });
  }

  var items = [{ label: primary + '  — best guess (' + usedPattern + ', ~' + confidence + '%)', value: primary }];
  alts.forEach(function (a) {
    items.push({ label: a + '  — alternate', value: a });
  });
  renderList(enrichResult, items, '', 'Copied guess: ');
  var extra = gh.length > 0 ? ' GitHub:' + gh.length : ' GitHub:0';
  var webExtra = ' Web:' + web.length;
  var mxExtra = mx === true ? ' MX:ok' : ' MX:?';
  setEnrichStatus('Pattern: ' + usedPattern + ' — ' + evidence + '.' + extra + webExtra + mxExtra + '. Unverified guess, use only with legitimate interest.');
  enrichBtn.disabled = false;
}

scanBtn.addEventListener('click', doScan);
copyAllBtn.addEventListener('click', function () {
  copy(state.emails.concat(state.phones).join('\n'), 'Copied all visible items.');
});
enrichBtn.addEventListener('click', doEnrich);

doScan();

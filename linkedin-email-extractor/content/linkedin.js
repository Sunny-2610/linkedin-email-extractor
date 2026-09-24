/* Content script: LinkedIn profile detection (FR-01/02/03) + visible contact scan. */
(function () {
  'use strict';

  var DENY = new Set([
    'example.com', 'example.org', 'example.net',
    'domain.com', 'yourdomain.com', 'youremail.com',
    'email.com', 'sentry.io', 'linkedin.com'
  ]);
  var EMAIL_RE = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  var OBFUSCATED = [
    [/\s*[\[\(\{]\s*at\s*[\]\)\}]\s*/g, '@'],
    [/\s*[\[\(\{]\s*dot\s*[\]\)\}]\s*/g, '.']
  ];
  var PHONE_CANDIDATE_RE = /(\+?\d[\d\s\-.\(\)]{6,}\d)/g;

  // FR-01: supported profile = /in/<slug> (individual), not /company/, /jobs/, /feed/
  function isProfilePage(url) {
    return /^https:\/\/(www\.)?linkedin\.com\/in\/[^/?#]+\/?/i.test(url || location.href);
  }

  // FR-02: normalize URL — strip query/hash/trailing slash
  function normalizeUrl(url) {
    try {
      var u = new URL(url || location.href);
      var path = u.pathname.replace(/\/+$/, '');
      // keep only /in/<slug> (drop /overlay/... etc.)
      var m = path.match(/^(\/[a-z]{2})?\/in\/[^/]+/i);
      var cleanPath = m ? m[0] : path;
      return u.origin + cleanPath;
    } catch (e) {
      return (url || location.href).split('?')[0].split('#')[0].replace(/\/+$/, '');
    }
  }

  function isPlausible(email) {
    if (!email || email.length > 254) return false;
    var parts = email.split('@');
    if (parts.length !== 2) return false;
    var domain = parts.pop().toLowerCase();
    if (DENY.has(domain) || domain === 'localhost') return false;
    var local = parts[0];
    if (!local || local.length > 64) return false;
    return true;
  }

  function isPlausiblePhone(raw) {
    if (!raw) return false;
    var digits = raw.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return false;
    if (raw.replace(/[\d+\s\-.\(\)]/g, '').length > 0) return false;
    return true;
  }

  function addEmailMatches(text, out) {
    if (!text) return;
    var m, re = new RegExp(EMAIL_RE.source, 'g');
    while ((m = re.exec(text)) !== null) {
      if (isPlausible(m[1])) out.add(m[1]);
    }
  }

  function addPhoneMatches(text, out) {
    if (!text) return;
    var m, re = new RegExp(PHONE_CANDIDATE_RE.source, 'g');
    while ((m = re.exec(text)) !== null) {
      var cand = m[1].trim();
      if (isPlausiblePhone(cand)) out.add(cand.replace(/\s+/g, ' '));
    }
  }

  function fromMailto(out) {
    document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
      var m = a.href.match(/mailto:([^?&]+)/i);
      if (m) {
        var em = decodeURIComponent(m[1]).trim();
        if (isPlausible(em)) out.add(em);
      }
    });
  }

  function fromTel(out) {
    document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
      var m = a.href.match(/tel:([^?&]+)/i);
      if (m) {
        var num = decodeURIComponent(m[1]).trim();
        if (isPlausiblePhone(num)) out.add(num);
      }
    });
  }

  // FR-03: basic visible profile data
  function extractProfile() {
    var profile = {
      name: '', firstName: '', lastName: '', headline: '',
      company: '', title: '', location: '',
      linkedinUrl: normalizeUrl(location.href)
    };
    try {
      var h1 = document.querySelector('main h1, h1');
      if (h1) profile.name = h1.innerText.trim().split('\n')[0];
      if (profile.name) {
        var parts = profile.name.split(/\s+/);
        profile.firstName = parts[0] || '';
        profile.lastName = parts.length > 1 ? parts[parts.length - 1] : '';
      }
      var headline = document.querySelector('main .text-body-medium, .top-card-layout__headline');
      if (headline) {
        profile.headline = headline.innerText.trim().split('\n')[0];
        profile.title = profile.headline;
      }
      var companyLink = document.querySelector('main a[href*="/company/"]');
      if (companyLink) {
        profile.company = (companyLink.innerText || companyLink.getAttribute('aria-label') || '').trim().split('\n')[0];
      }
      var loc = document.querySelector('main .text-body-small.inline, .top-card__subline-item');
      if (loc) profile.location = loc.innerText.trim().split('\n')[0];
    } catch (e) { /* best effort */ }
    return profile;
  }

  function findContactInfoTrigger() {
    var a = document.querySelector('a[href*="/overlay/contact-info"]');
    if (a) return a;
    var candidates = document.querySelectorAll('main a, main button');
    for (var i = 0; i < candidates.length; i++) {
      var t = (candidates[i].innerText || '').trim().toLowerCase();
      if (t === 'contact info' || t.indexOf('contact info') === 0) return candidates[i];
    }
    return null;
  }

  function contactModalText() {
    var modal = document.querySelector('.artdeco-modal, [role="dialog"]');
    if (modal && /contact|email|phone|website/i.test(modal.innerText.slice(0, 500))) {
      return modal.innerText;
    }
    return '';
  }

  function extractAll() {
    var emails = new Set();
    var phones = new Set();
    fromMailto(emails);
    fromTel(phones);
    var raw = document.body ? document.body.innerText : '';
    raw += '\n' + contactModalText();
    addEmailMatches(raw, emails);
    var normalized = raw;
    OBFUSCATED.forEach(function (pair) { normalized = normalized.replace(pair[0], pair[1]); });
    addEmailMatches(normalized, emails);
    addPhoneMatches(raw, phones);
    return { emails: Array.from(emails), phones: Array.from(phones), profile: extractProfile() };
  }

  function openContactInfoIfClosed() {
    return new Promise(function (resolve) {
      if (contactModalText()) return resolve();
      var trigger = findContactInfoTrigger();
      if (!trigger) return resolve();
      try { trigger.click(); } catch (e) { return resolve(); }
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        if (contactModalText() || tries > 10) { clearInterval(timer); resolve(); }
      }, 250);
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'PING') { sendResponse({ ok: true }); return; }
    if (msg && msg.type === 'GET_PROFILE') {
      sendResponse({
        isProfile: isProfilePage(),
        linkedinUrl: normalizeUrl(location.href),
        profile: extractProfile()
      });
      return;
    }
    if (msg && msg.type === 'SCAN') {
      if (!isProfilePage()) {
        sendResponse({ isProfile: false, emails: [], phones: [], profile: extractProfile() });
        return;
      }
      openContactInfoIfClosed().then(function () {
        var data = extractAll();
        data.isProfile = true;
        data.linkedinUrl = normalizeUrl(location.href);
        sendResponse(data);
      });
      return true;
    }
  });
})();

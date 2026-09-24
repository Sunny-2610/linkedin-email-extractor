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
  // Visible phones only: +1 555-123-4567, (555) 123 4567, 0044 ... etc.
  // We validate by digit-count (7-15) to avoid matching years / counts.
  var PHONE_CANDIDATE_RE = /(\+?\d[\d\s\-.\(\)]{6,}\d)/g;

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
    // Drop pure years like 2026, 1990-2026 ranges already fail digit check mostly.
    // Drop things that are mostly separators.
    if (raw.replace(/[\d+\s\-.\(\)]/g, '').length > 0) return false;
    return true;
  }

  function addEmailMatches(text, out) {
    if (!text) return;
    var m;
    var re = new RegExp(EMAIL_RE.source, 'g');
    while ((m = re.exec(text)) !== null) {
      if (isPlausible(m[1])) out.add(m[1]);
    }
  }

  function addPhoneMatches(text, out) {
    if (!text) return;
    var m;
    var re = new RegExp(PHONE_CANDIDATE_RE.source, 'g');
    while ((m = re.exec(text)) !== null) {
      var cand = m[1].trim();
      if (isPlausiblePhone(cand)) out.add(cand.replace(/\s+/g, ' '));
    }
  }

  function fromMailto(out) {
    document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
      var m = a.href.match(/mailto:([^?&]+)/i);
      if (m && isPlausible(decodeURIComponent(m[1]).trim())) {
        out.add(decodeURIComponent(m[1]).trim());
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

  function extractProfile() {
    var profile = { name: '', firstName: '', lastName: '', headline: '', company: '', profileUrl: location.href };
    try {
      var h1 = document.querySelector('main h1, h1');
      if (h1) profile.name = h1.innerText.trim().split('\n')[0];
      if (profile.name) {
        var parts = profile.name.split(/\s+/);
        profile.firstName = parts[0] || '';
        profile.lastName = parts.length > 1 ? parts[parts.length - 1] : '';
      }
      var headline = document.querySelector('main .text-body-medium, .pv-top-card--list-headline, .top-card-layout__headline');
      if (headline) profile.headline = headline.innerText.trim().split('\n')[0];
      // Best-effort current company: first /company/ link in top card / experience.
      var companyLink = document.querySelector('main a[href*="/company/"]');
      if (companyLink) {
        profile.company = (companyLink.innerText || companyLink.getAttribute('aria-label') || '').trim().split('\n')[0];
      }
    } catch (e) { /* best effort */ }
    return profile;
  }

  function findContactInfoTrigger() {
    // LinkedIn uses: a[href$="/overlay/contact-info/"] or button with "Contact info" text.
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
    OBFUSCATED.forEach(function (pair) {
      normalized = normalized.replace(pair[0], pair[1]);
    });
    addEmailMatches(normalized, emails);
    addPhoneMatches(raw, phones);

    return {
      emails: Array.from(emails),
      phones: Array.from(phones),
      profile: extractProfile()
    };
  }

  function openContactInfoIfClosed() {
    return new Promise(function (resolve) {
      // Already open?
      if (contactModalText()) return resolve();
      var trigger = findContactInfoTrigger();
      if (!trigger) return resolve();
      try { trigger.click(); } catch (e) { return resolve(); }
      // Wait for modal to render (lazy-loaded).
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        if (contactModalText() || tries > 10) {
          clearInterval(timer);
          resolve();
        }
      }, 250);
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'SCAN') {
      // Async: open Contact Info first, then extract. Keep channel open.
      openContactInfoIfClosed().then(function () {
        sendResponse(extractAll());
      });
      return true;
    }
    if (msg && msg.type === 'PING') {
      sendResponse({ ok: true });
    }
  });
})();
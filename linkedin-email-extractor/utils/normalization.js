'use strict';
// Normalization (Sec 9): provider responses -> common result format.
var LCE = window.LCE || {};
LCE.norm = (function () {
  function normalizeUrl(url) {
    try {
      var u = new URL(url);
      var path = u.pathname.replace(/\/+$/, '');
      var m = path.match(/^(\/[a-z]{2})?\/in\/[^/]+/i);
      return u.origin + (m ? m[0] : path);
    } catch (e) {
      return String(url || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
    }
  }
  function splitName(profile) {
    profile = profile || {};
    if (profile.firstName && profile.lastName) return { first: profile.firstName, last: profile.lastName };
    var parts = String(profile.name || '').split(/\s+/).filter(Boolean);
    return { first: parts[0] || '', last: parts.length > 1 ? parts[parts.length - 1] : '' };
  }
  function clean(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  }
  function emptyResult(person, source) {
    return {
      person: person,
      email: { value: '', status: 'unknown', source: source || '' },
      phone: { value: '', type: '', source: source || '' },
      metadata: { enrichedAt: new Date().toISOString(), source: source || '' }
    };
  }
  return { normalizeUrl: normalizeUrl, splitName: splitName, clean: clean, emptyResult: emptyResult };
})();
window.LCE = LCE;

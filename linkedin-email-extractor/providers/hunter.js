'use strict';
// Hunter adapter (Sec 8). Email only — Hunter has no phone API; phone returns Not available from provider.
var LCE = window.LCE || {};
LCE.providers = LCE.providers || {};
LCE.providers.hunter = (function () {
  var ID = 'hunter';

  function validateCredentials(apiKey) {
    if (!apiKey) return Promise.resolve({ ok: false, message: 'No API key configured. Open Settings to add your Hunter API key.' });
    return fetch('https://api.hunter.io/v2/account?api_key=' + encodeURIComponent(apiKey))
      .then(function (r) {
        if (r.status === 401 || r.status === 403) return { ok: false, message: 'Your Hunter API key appears to be invalid. Please check your API key in Settings.' };
        if (!r.ok) return { ok: false, message: 'The provider is temporarily unavailable. Please try again later.' };
        return r.json().then(function () { return { ok: true, message: 'API key is valid' }; });
      })
      .catch(function () {
        return { ok: false, message: 'The provider is temporarily unavailable. Please try again later.' };
      });
  }

  function enrichPerson(profile, apiKey, opts) {
    opts = opts || {};
    var nm = LCE.norm.splitName(profile);
    if (!opts.domain) {
      return Promise.reject(Object.assign(new Error('missing_domain'), { code: 'missing_domain', provider: ID }));
    }
    if (!nm.first || !nm.last) {
      return Promise.reject(Object.assign(new Error('missing_name'), { code: 'missing_name', provider: ID }));
    }
    var url = 'https://api.hunter.io/v2/email-finder?domain=' + encodeURIComponent(opts.domain) +
      '&first_name=' + encodeURIComponent(nm.first) + '&last_name=' + encodeURIComponent(nm.last) +
      '&api_key=' + encodeURIComponent(apiKey);
    return fetch(url).then(function (r) {
      if (r.status === 401 || r.status === 403) throw hunterError('invalid_key');
      if (r.status === 429) throw hunterError('rate_limit');
      if (!r.ok) throw hunterError('provider', r.status);
      return r.json();
    }).then(function (j) {
      var email = (j.data && j.data.email) || '';
      var score = j.data && j.data.score;
      var v = (j.data && j.data.verification && j.data.verification.status) || 'unknown';
      return {
        person: { name: profile.name || '', title: profile.title || '', company: profile.company || '', linkedinUrl: profile.linkedinUrl || '' },
        email: { value: email || '', status: email ? v : 'unknown', score: score, source: ID },
        phone: { value: '', type: '', source: ID, note: 'Not available from provider' },
        metadata: { enrichedAt: new Date().toISOString(), source: ID }
      };
    });
  }

  function hunterError(code, status) {
    var e = new Error(code);
    e.code = code; e.status = status; e.provider = ID;
    return e;
  }

  return { id: ID, validateCredentials: validateCredentials, enrichPerson: enrichPerson };
})();
window.LCE = LCE;

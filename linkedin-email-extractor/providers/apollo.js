'use strict';
// Apollo adapter (Sec 8). BYOK: key passed in, never stored here, never logged.
var LCE = window.LCE || {};
LCE.providers = LCE.providers || {};
LCE.providers.apollo = (function () {
  var ID = 'apollo';
  var MATCH_URL = 'https://api.apollo.io/v1/people/match';

  function headers(key) {
    return { 'Content-Type': 'application/json', 'X-Api-Key': key, 'accept': 'application/json' };
  }

  // FR-07: validate without spending credits — empty match returns 422/400 when key is valid, 401/403 when invalid.
  function validateCredentials(apiKey) {
    if (!apiKey) return Promise.resolve({ ok: false, message: 'No API key configured. Open Settings to add your Apollo API key.' });
    return fetch(MATCH_URL, {
      method: 'POST', headers: headers(apiKey), body: JSON.stringify({ api_key: apiKey })
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) return { ok: false, message: 'Your Apollo API key appears to be invalid. Please check your API key in Settings.' };
      // 422/400/200 all mean the key was accepted (request itself was empty/incomplete).
      return { ok: true, message: 'API key is valid' };
    }).catch(function () {
      return { ok: false, message: 'The provider is temporarily unavailable. Please try again later. (Also possible: browser CORS block — use Test again or try Hunter.)' };
    });
  }

  function enrichPerson(profile, apiKey, opts) {
    opts = opts || {};
    var nm = LCE.norm.splitName(profile);
    var body = { api_key: apiKey };
    if (nm.first) body.first_name = nm.first;
    if (nm.last) body.last_name = nm.last;
    if (opts.domain) body.domain = opts.domain;
    if (profile && profile.linkedinUrl) body.linkedin_url = profile.linkedinUrl;
    return fetch(MATCH_URL, { method: 'POST', headers: headers(apiKey), body: JSON.stringify(body) })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) throw apolloError('invalid_key');
        if (r.status === 429) throw apolloError('rate_limit');
        if (!r.ok) throw apolloError('provider', r.status);
        return r.json();
      })
      .then(function (j) {
        var p = j.person || j || {};
        var email = p.email || p.work_email || (p.personal_emails && p.personal_emails[0]) || '';
        var phone = p.phone_number || p.phone ||
          ((p.phone_numbers || [])[0] && (p.phone_numbers[0].sanitized_number || p.phone_numbers[0].raw_number)) || '';
        return {
          person: {
            name: profile.name || [p.first_name, p.last_name].filter(Boolean).join(' '),
            title: profile.title || p.title || '',
            company: profile.company || (p.organization && p.organization.name) || '',
            linkedinUrl: profile.linkedinUrl || p.linkedin_url || ''
          },
          email: { value: email || '', status: email ? (p.email_status || 'unknown') : 'unknown', source: ID },
          phone: { value: phone || '', type: phone ? 'mobile' : '', source: ID },
          metadata: { enrichedAt: new Date().toISOString(), source: ID }
        };
      });
  }

  function apolloError(code, status) {
    var e = new Error(code);
    e.code = code; e.status = status; e.provider = ID;
    return e;
  }

  return { id: ID, validateCredentials: validateCredentials, enrichPerson: enrichPerson };
})();
window.LCE = LCE;

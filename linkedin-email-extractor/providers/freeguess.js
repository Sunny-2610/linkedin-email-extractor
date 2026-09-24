'use strict';
// Local free pattern guess (no key, no card). NOT a paid provider — best-effort only.
// Sources: GitHub public commits + company website + DNS MX. Never verified.
var LCE = window.LCE || {};
LCE.providers = LCE.providers || {};
LCE.providers.local = (function () {
  var ID = 'local';
  var TEMPLATES = ['first.last', 'firstlast', 'flast', 'first', 'first.l', 'first_last', 'f.last', 'last.first', 'last', 'fl', 'lastf', 'lastfirst'];

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

  function withTimeout(url, ms, opts) {
    var ctrl = new AbortController();
    var id = setTimeout(function () { ctrl.abort(); }, ms || 8000);
    return fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal })).finally(function () { clearTimeout(id); });
  }

  function githubSamples(domain) {
    try {
      var url = 'https://api.github.com/search/commits?q=author-email%3A%40' + encodeURIComponent(domain) + '&per_page=30';
      return withTimeout(url, 9000, { headers: { Accept: 'application/vnd.github+json' } }).then(function (r) {
        if (!r.ok) return [];
        return r.json().then(function (j) {
          var out = [];
          (j.items || []).forEach(function (it) {
            var a = it.commit && it.commit.author;
            if (a && a.email && a.name && a.email.toLowerCase().endsWith('@' + domain)) out.push({ name: a.name, email: a.email.toLowerCase() });
          });
          return out;
        });
      }).catch(function () { return []; });
    } catch (e) { return Promise.resolve([]); }
  }

  function detectPattern(samples) {
    var scores = TEMPLATES.map(function (t) { return { template: t, hits: 0, total: 0 }; });
    samples.forEach(function (s) {
      var parts = String(s.name || '').split(/\s+/).filter(Boolean);
      if (parts.length < 2) return;
      var f = LCE.norm.clean(parts[0]);
      var l = LCE.norm.clean(parts[parts.length - 1]);
      if (!f || !l) return;
      var local = String(s.email.split('@')[0] || '').toLowerCase();
      scores.forEach(function (sc) {
        sc.total++;
        if (applyTemplate(sc.template, f, l) === local) sc.hits++;
      });
    });
    scores.forEach(function (sc) { sc.conf = sc.total > 0 ? sc.hits / sc.total : 0; });
    scores.sort(function (a, b) { return (b.conf - a.conf) || (b.hits - a.hits); });
    return scores;
  }

  function hasMX(domain) {
    return withTimeout('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX', 7000)
      .then(function (r) { return r.json(); })
      .then(function (j) { return !!(j.Answer && j.Answer.length); })
      .catch(function () { return null; });
  }

  function suggestDomain(company) {
    return withTimeout('https://autocomplete.clearbit.com/v1/companies/suggest?query=' + encodeURIComponent(company), 7000)
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && j[0] && j[0].domain) || ''; })
      .catch(function () { return ''; });
  }

  function enrichPerson(profile, _unused, opts) {
    opts = opts || {};
    var domain = String(opts.domain || '').toLowerCase();
    var nm = LCE.norm.splitName(profile);
    var f = LCE.norm.clean(nm.first);
    var l = LCE.norm.clean(nm.last);
    if (!domain || domain.indexOf('.') < 0) return Promise.reject(Object.assign(new Error('missing_domain'), { code: 'missing_domain', provider: ID }));
    if (!f || !l) return Promise.reject(Object.assign(new Error('missing_name'), { code: 'missing_name', provider: ID }));
    return Promise.all([githubSamples(domain), hasMX(domain)]).then(function (res) {
      var gh = res[0], mx = res[1];
      if (mx === false) throw Object.assign(new Error('bad_domain'), { code: 'bad_domain', provider: ID });
      var scores = detectPattern(gh);
      var top = scores[0];
      var pattern = 'first.last', conf = 40, evidence = 'default (no public samples)';
      if (top && top.total >= 2 && top.conf >= 0.5) {
        pattern = top.template;
        evidence = top.hits + '/' + top.total + ' GitHub samples match ' + pattern;
        conf = (top.total >= 5 && top.conf >= 0.8) ? 75 : 60;
      }
      var primary = applyTemplate(pattern, f, l) + '@' + domain;
      return {
        person: { name: profile.name || '', title: profile.title || '', company: profile.company || '', linkedinUrl: profile.linkedinUrl || '' },
        email: { value: primary, status: 'unverified-guess', confidence: conf, pattern: pattern, evidence: evidence, source: ID },
        phone: { value: '', type: '', source: ID, note: 'Not available from provider' },
        metadata: { enrichedAt: new Date().toISOString(), source: ID }
      };
    });
  }

  return { id: ID, enrichPerson: enrichPerson, suggestDomain: suggestDomain };
})();
window.LCE = LCE;

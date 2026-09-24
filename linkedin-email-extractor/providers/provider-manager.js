'use strict';
// Provider manager (Sec 8, FR-15/16/17): primary + optional fallback, credit-aware, normalized errors.
var LCE = window.LCE || {};
LCE.providerManager = (function () {
  function adapter(id) {
    return (LCE.providers || {})[id];
  }

  function friendlyError(err) {
    err = err || {};
    switch (err.code) {
      case 'invalid_key': return 'Your ' + cap(err.provider) + ' API key appears to be invalid. Please check your API key in Settings.';
      case 'rate_limit': return 'Provider rate limit reached. Please try again later.';
      case 'missing_key': return 'No API key configured. Open Settings to add your provider API key.';
      case 'missing_domain': return 'Company domain is required for this lookup. Enter it (e.g. acme.com).';
      case 'missing_name': return 'Scan a profile first so we have first + last name.';
      case 'bad_domain': return 'This domain cannot receive mail (no MX records). Check the domain.';
      case 'provider': return 'The provider is temporarily unavailable. Please try again later.';
      default: return 'No contact information was returned by the provider.';
    }
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Provider'; }

  function hasUsefulResult(res) {
    return !!(res && ((res.email && res.email.value) || (res.phone && res.phone.value)));
  }

  // FR-08/09/10/15: enrich via primary, optionally fallback if no useful result.
  // Never calls fallback when primary succeeded — avoids wasting user credits.
  function enrich(profile, keys, settings, opts) {
    settings = settings || { primaryProvider: 'apollo', fallbackProvider: 'hunter', fallbackEnabled: true };
    opts = opts || {};
    var primary = settings.primaryProvider || 'apollo';
    var fallback = settings.fallbackProvider || 'hunter';
    var result = { primary: primary, fallback: fallback, usedFallback: false, result: null, error: '' };

    function call(id) {
      var a = adapter(id);
      if (!a) return Promise.reject(Object.assign(new Error('unknown provider'), { code: 'provider', provider: id }));
      var key = id === 'apollo' ? keys.apolloApiKey : keys.hunterApiKey;
      if (!key) return Promise.reject(Object.assign(new Error('no key'), { code: 'missing_key', provider: id }));
      return a.enrichPerson(profile, key, opts);
    }

    return call(primary).then(function (res) {
      if (hasUsefulResult(res) || !settings.fallbackEnabled || fallback === primary) {
        result.result = res;
        return result;
      }
      // Primary returned nothing useful — try fallback once.
      return call(fallback).then(function (res2) {
        result.usedFallback = true;
        result.result = res2;
        return result;
      }).catch(function () {
        result.result = res; // keep primary (empty) result, don't hide it
        return result;
      });
    }).catch(function (err) {
      // Primary errored (auth/rate/network) — do NOT auto-fallback on auth errors to avoid double charges confusion.
      if (settings.fallbackEnabled && fallback !== primary && err.code !== 'invalid_key' && err.code !== 'missing_key') {
        return call(fallback).then(function (res2) {
          result.usedFallback = true;
          result.result = res2;
          return result;
        }).catch(function () {
          result.error = friendlyError(err);
          return result;
        });
      }
      result.error = friendlyError(err);
      return result;
    });
  }

  return { enrich: enrich, friendlyError: friendlyError, hasUsefulResult: hasUsefulResult };
})();
window.LCE = LCE;

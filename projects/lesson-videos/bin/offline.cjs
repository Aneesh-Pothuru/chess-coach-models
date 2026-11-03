// Preloaded (NODE_OPTIONS=--require) into every node process of an eval case:
// chess.com is unreachable, so a past period reads its own data (the level
// falls back to the synced profile) and nothing fetches today's games. With
// EVAL_ARCHIVE=1 (the case build's prepare only), a player's monthly game
// archives stay reachable: they never change for a past window, and the
// aggregate counts the games the engine did not analyse from them, as the
// period's own prepare did.
'use strict';
const BLOCK = /(^|\.)chess\.com$/i;
const ARCHIVE = /^\/pub\/player\/[^/]+\/games\/\d{4}\/\d{2}\/?$/;
const parse = (u) => {
  try {
    return new URL(String(u && u.url ? u.url : u));
  } catch {
    return null;
  }
};
const allowed = (url) => process.env.EVAL_ARCHIVE === '1' && url && /^api\.chess\.com$/i.test(url.hostname) && ARCHIVE.test(url.pathname);
const blocked = (url) => url && BLOCK.test(url.hostname) && !allowed(url);
if (typeof globalThis.fetch === 'function') {
  const real = globalThis.fetch;
  globalThis.fetch = function (input, init) {
    if (blocked(parse(input))) return Promise.reject(new Error('chess.com is offline in an eval case'));
    return real.call(this, input, init);
  };
}
for (const mod of ['http', 'https']) {
  const m = require(mod);
  for (const fn of ['request', 'get']) {
    const real = m[fn];
    m[fn] = function (a, b, c) {
      let url = null;
      if (typeof a === 'string' || a instanceof URL) url = parse(a);
      else if (a && (a.hostname || a.host)) url = parse(`https://${String(a.hostname || a.host).replace(/:\d+$/, '')}${a.path || '/'}`);
      if (blocked(url)) throw new Error('chess.com is offline in an eval case');
      return real.call(this, a, b, c);
    };
  }
}

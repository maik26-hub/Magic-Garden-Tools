/** Dedicated updater transport.
 * Tampermonkey GM_xmlhttpRequest bypasses the game's connect-src/CORS limits.
 * The fetch fallback is for non-Tampermonkey environments and offline tests.
 * Neither path runs, evaluates, or imports the remote userscript.
 */
async function fetchReleaseSource(url, options = {}) {
  const gm = options.gmRequest;
  const fetchImpl = options.fetchImpl;
  const timeoutMs = options.timeoutMs || 10000;
  const now = typeof options.now === 'function' ? options.now() : Date.now();
  const requestURL = url + (url.includes('?') ? '&' : '?') + 'check=' + now;
  let gmError = null;
  if (typeof gm === 'function') {
    try {
      return await new Promise((resolve, reject) => {
        let settled = false;
        const done = (error, value) => {
          if (settled) return;
          settled = true;
          if (error) reject(error);
          else resolve(value);
        };
        try {
          gm({
            method: 'GET',
            url: requestURL,
            anonymous: true,
            timeout: timeoutMs,
            onload: response => {
              if (response?.status !== 200 ||
                  typeof response.responseText !== 'string') {
                done(new Error('Updater HTTP ' + (response?.status ?? 'unbekannt')));
              } else {
                done(null, response.responseText);
              }
            },
            onerror: () => done(new Error('Updater-Netzwerkfehler')),
            ontimeout: () => done(new Error('Updater-Timeout')),
            onabort: () => done(new Error('Updater abgebrochen'))
          });
        } catch (error) {
          done(error);
        }
      });
    } catch (error) {
      // The secondary fetch is useful with userscript managers where GM
      // permission is unavailable; failure stays neutral in the UI.
      gmError = error;
    }
  }
  if (typeof fetchImpl !== 'function') throw gmError || new Error('Updater-Transport fehlt');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(requestURL, {
      cache: 'no-store', credentials: 'omit', mode: 'cors',
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Updater HTTP ' + response.status);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { fetchReleaseSource };

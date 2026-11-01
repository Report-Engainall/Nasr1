/* Aghbari offline shell. Financial data, auth responses and Supabase traffic are never cached. */
const CACHE_NAME = 'aghbari-shell-v3';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.ico'];

const STATIC_ASSET_MIME_POLICIES = [
  { extension: /\.js$/i, types: ['application/javascript', 'text/javascript', 'application/ecmascript', 'text/ecmascript', 'application/x-javascript'] },
  { extension: /\.css$/i, types: ['text/css'] },
  { extension: /\.svg$/i, types: ['image/svg+xml'] },
  { extension: /\.png$/i, types: ['image/png'] },
  { extension: /\.jpe?g$/i, types: ['image/jpeg'] },
  { extension: /\.webp$/i, types: ['image/webp'] },
  { extension: /\.woff2?$/i, types: ['font/woff', 'font/woff2', 'application/font-woff', 'application/font-woff2', 'application/x-font-woff'] },
  { extension: /\.ico$/i, types: ['image/x-icon', 'image/vnd.microsoft.icon', 'image/ico'] },
];

function responseMimeType(response) {
  return (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
}

function hasExpectedStaticAssetMimeType(pathname, contentType) {
  const mimeType = (contentType || '').split(';', 1)[0].trim().toLowerCase();
  const policy = STATIC_ASSET_MIME_POLICIES.find((entry) => entry.extension.test(pathname));
  return Boolean(policy && policy.types.includes(mimeType));
}

function isHtmlResponse(response) {
  const mimeType = responseMimeType(response);
  return mimeType === 'text/html' || mimeType === 'application/xhtml+xml';
}

// Never emit Error.message or Error.stack from a browser request/cache path:
// either may contain a credential-bearing URL or provider response text.
function diagnosticErrorType(error) {
  const tag = Object.prototype.toString.call(error);
  if (error instanceof TypeError || tag === '[object TypeError]') return 'TypeError';
  if (error instanceof Error || tag === '[object Error]') return 'Error';
  return 'UnknownError';
}

function isExpectedShellMimeType(pathname, response) {
  if (pathname === '/') return isHtmlResponse(response);
  if (pathname === '/manifest.webmanifest') {
    const mimeType = responseMimeType(response);
    return mimeType === 'application/manifest+json' || mimeType === 'application/json';
  }
  return hasExpectedStaticAssetMimeType(pathname, response.headers.get('content-type'));
}

async function cacheOptionalShellAsset(cache, url) {
  try {
    const response = await fetch(url);
    if (!response.ok || response.type !== 'basic' || !isExpectedShellMimeType(url, response)) return;
    await cache.put(url, response);
  } catch (error) {
    console.warn('[aghbari-sw] optional shell asset was not cached', {
      url,
      errorType: diagnosticErrorType(error),
    });
  }
}

async function installShell() {
  try {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL.map((url) => cacheOptionalShellAsset(cache, url)));
  } catch (error) {
    console.warn('[aghbari-sw] shell installation cache failed', {
      errorType: diagnosticErrorType(error),
    });
  }

  try {
    await self.skipWaiting();
  } catch (error) {
    console.warn('[aghbari-sw] skipWaiting failed', {
      errorType: diagnosticErrorType(error),
    });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    installShell().catch((error) => {
      console.error('[aghbari-sw] install lifecycle failed', {
        errorType: diagnosticErrorType(error),
      });
    }),
  );
});

async function removeObsoleteShellCaches() {
  const keys = await caches.keys();
  const obsolete = keys.filter((key) => key.startsWith('aghbari-shell-') && key !== CACHE_NAME);
  const results = await Promise.allSettled(obsolete.map((key) => caches.delete(key)));

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn('[aghbari-sw] obsolete shell cache removal failed', {
        cacheName: obsolete[index],
        errorType: diagnosticErrorType(result.reason),
      });
    }
  });
}

async function activateShell() {
  try {
    await removeObsoleteShellCaches();
  } catch (error) {
    console.warn('[aghbari-sw] shell cache cleanup failed', {
      errorType: diagnosticErrorType(error),
    });
  }

  try {
    await self.clients.claim();
  } catch (error) {
    console.warn('[aghbari-sw] client claim failed', {
      errorType: diagnosticErrorType(error),
    });
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    activateShell().catch((error) => {
      console.error('[aghbari-sw] activate lifecycle failed', {
        errorType: diagnosticErrorType(error),
      });
    }),
  );
});

async function cachedShellOrError(networkError) {
  if (networkError) {
    console.warn('[aghbari-sw] navigation network request failed; trying cached shell', {
      errorType: diagnosticErrorType(networkError),
    });
  }

  try {
    return (await caches.match('/')) || Response.error();
  } catch (error) {
    console.error('[aghbari-sw] cached shell lookup failed', {
      errorType: diagnosticErrorType(error),
    });
    return Response.error();
  }
}

function schedulePublicHomeCache(event, url, response) {
  if (!(response.ok && url.pathname === '/')) return;
  if (!isHtmlResponse(response)) return;

  const homeResponse = response.clone();
  const cacheWrite = caches.open(CACHE_NAME)
    .then((cache) => cache.put('/', homeResponse));
  const handledWrite = cacheWrite.catch((error) => {
    console.warn('[aghbari-sw] navigation shell cache write failed', {
      url: url.pathname,
      errorType: diagnosticErrorType(error),
    });
  });

  try {
    event.waitUntil(handledWrite);
  } catch (error) {
    console.warn('[aghbari-sw] navigation cache lifecycle registration failed', {
      url: url.pathname,
      errorType: diagnosticErrorType(error),
    });
  }
}

async function handleNavigationRequest(request, url, event) {
  try {
    const response = await fetch(request);
    schedulePublicHomeCache(event, url, response);
    return response;
  } catch (error) {
    return cachedShellOrError(error);
  }
}

function isCacheableStaticAsset(url, response) {
  return response.ok &&
    response.type === 'basic' &&
    url.pathname.startsWith('/assets/') &&
    /\.(js|css|svg|png|jpe?g|webp|woff2?|ico)$/i.test(url.pathname) &&
    hasExpectedStaticAssetMimeType(url.pathname, response.headers.get('content-type'));
}

function scheduleStaticAssetCache(event, request, url, response) {
  if (!isCacheableStaticAsset(url, response)) return;

  const cacheWrite = caches.open(CACHE_NAME)
    .then((cache) => cache.put(request, response.clone()));
  const handledWrite = cacheWrite.catch((error) => {
    console.warn('[aghbari-sw] static asset cache write failed', {
      url: url.pathname,
      errorType: diagnosticErrorType(error),
    });
  });

  try {
    event.waitUntil(handledWrite);
  } catch (error) {
    console.warn('[aghbari-sw] static asset cache lifecycle registration failed', {
      url: url.pathname,
      errorType: diagnosticErrorType(error),
    });
  }
}

async function fetchStaticAsset(request, url, event, backgroundRefresh) {
  try {
    const response = await fetch(request);
    scheduleStaticAssetCache(event, request, url, response);
    return response;
  } catch (error) {
    if (backgroundRefresh) {
      console.warn('[aghbari-sw] background asset refresh failed; serving cached response', {
        url: url.pathname,
        errorType: diagnosticErrorType(error),
      });
      return null;
    }

    console.error('[aghbari-sw] static asset request failed with no cached response', {
      url: url.pathname,
      errorType: diagnosticErrorType(error),
    });
    return Response.error();
  }
}

async function handleStaticAssetRequest(request, url, event) {
  let cached = null;
  try {
    cached = await caches.match(request);
  } catch (error) {
    console.warn('[aghbari-sw] static asset cache lookup failed', {
      url: url.pathname,
      errorType: diagnosticErrorType(error),
    });
  }

  if (!cached) return fetchStaticAsset(request, url, event, false);

  const refresh = fetchStaticAsset(request, url, event, true)
    .then(() => undefined)
    .catch((error) => {
      console.warn('[aghbari-sw] background asset refresh failed; serving cached response', {
        url: url.pathname,
        errorType: diagnosticErrorType(error),
      });
    });

  try {
    event.waitUntil(refresh);
  } catch (error) {
    console.warn('[aghbari-sw] background refresh lifecycle registration failed', {
      url: url.pathname,
      errorType: diagnosticErrorType(error),
    });
  }
  return cached;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/\/(rest|auth|api|rpc|storage|functions)\//i.test(url.pathname)) return;

  const response = request.mode === 'navigate'
    ? handleNavigationRequest(request, url, event)
    : handleStaticAssetRequest(request, url, event);
  event.respondWith(
    response.catch((error) => {
      console.error('[aghbari-sw] request handler failed', {
        url: url.pathname,
        errorType: diagnosticErrorType(error),
      });
      return Response.error();
    }),
  );
});

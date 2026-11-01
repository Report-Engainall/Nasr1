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

// Never emit Error.message, Error.stack, URL queries or fragments in a diagnostic.
function diagnosticErrorType(error) {
  const tag = Object.prototype.toString.call(error);
  if (error instanceof TypeError || tag === '[object TypeError]') return 'TypeError';
  if (error instanceof Error || tag === '[object Error]') return 'Error';
  return 'UnknownError';
}

function reportServiceWorkerDiagnostic(level, code, pathname, error) {
  const message = {
    type: 'aghbari:service-worker-diagnostic',
    level,
    code,
    ...(pathname ? { pathname } : {}),
    ...(error ? { errorType: diagnosticErrorType(error) } : {}),
  };
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      clients.forEach((client) => client.postMessage(message));
    })
    .catch(() => undefined);
}

function isExpectedShellMimeType(pathname, response) {
  if (pathname === '/') return isHtmlResponse(response);
  if (pathname === '/manifest.webmanifest') {
    const mimeType = responseMimeType(response);
    return mimeType === 'application/manifest+json' || mimeType === 'application/json';
  }
  return hasExpectedStaticAssetMimeType(pathname, response.headers.get('content-type'));
}

async function cacheShellAsset(url, cache) {
  try {
    const response = await fetch(url);
    if (!response.ok || response.type !== 'basic' || !isExpectedShellMimeType(url, response)) return;
    await cache.put(url, response);
  } catch (error) {
    await reportServiceWorkerDiagnostic('warning', 'optional-shell-asset-not-cached', url, error);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(SHELL.map((url) => cacheShellAsset(url, cache))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('aghbari-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cachedShellOrError(networkError, pathname) {
  if (networkError) {
    await reportServiceWorkerDiagnostic('warning', 'navigation-network-failed', pathname, networkError);
  }
  try {
    return (await caches.match('/')) || Response.error();
  } catch (error) {
    await reportServiceWorkerDiagnostic('error', 'cached-shell-lookup-failed', pathname, error);
    return Response.error();
  }
}

function cachePublicHomeResponse(event, response, pathname) {
  if (!response.ok || pathname !== '/' || !isHtmlResponse(response)) return;
  const homeResponse = response.clone();
  const cacheWrite = caches.open(CACHE_NAME)
    .then((cache) => cache.put('/', homeResponse))
    .catch((error) => reportServiceWorkerDiagnostic('warning', 'navigation-shell-cache-write-failed', pathname, error));
  event.waitUntil(cacheWrite);
}

function handleNavigationFetch(event, request, url) {
  const navigationResponse = fetch(request)
    .then((response) => {
      // Only the public home shell is cached; identity-bound deep routes stay network-only.
      cachePublicHomeResponse(event, response, url.pathname);
      return response;
    })
    .catch((error) => cachedShellOrError(error, url.pathname));
  event.respondWith(navigationResponse);
}

function isCacheableStaticAsset(url, response) {
  return response.ok &&
    response.type === 'basic' &&
    url.pathname.startsWith('/assets/') &&
    /\.(js|css|svg|png|jpe?g|webp|woff2?|ico)$/i.test(url.pathname) &&
    hasExpectedStaticAssetMimeType(url.pathname, response.headers.get('content-type'));
}

function cacheStaticAssetResponse(event, request, response, url) {
  if (!isCacheableStaticAsset(url, response)) return;
  const cacheWrite = caches.open(CACHE_NAME)
    .then((cache) => cache.put(request, response.clone()))
    .catch((error) => reportServiceWorkerDiagnostic('warning', 'static-asset-cache-write-failed', url.pathname, error));
  event.waitUntil(cacheWrite);
}

function fetchStaticAsset(request, url, event) {
  return fetch(request).then((response) => {
    // A missing JS asset can fall back to index.html with HTTP 200; never cache it as JS.
    cacheStaticAssetResponse(event, request, response, url);
    return response;
  });
}

function refreshCachedAssetInBackground(event, networkResponse, pathname) {
  event.waitUntil(
    networkResponse.then(() => undefined).catch((error) =>
      reportServiceWorkerDiagnostic('warning', 'background-asset-refresh-failed', pathname, error),
    ),
  );
}

function handleStaticAssetFetch(event, request, url) {
  const assetResponse = caches.match(request).then((cached) => {
    const networkResponse = fetchStaticAsset(request, url, event);
    if (cached) {
      // Serve the cache immediately while keeping refresh failures observable and handled.
      refreshCachedAssetInBackground(event, networkResponse, url.pathname);
      return cached;
    }
    return networkResponse.catch((error) =>
      reportServiceWorkerDiagnostic('error', 'static-asset-request-failed', url.pathname, error)
        .then(() => Response.error()),
    );
  });
  event.respondWith(assetResponse);
}

function shouldHandleSameOriginGet(request, url) {
  return request.method === 'GET' &&
    url.origin === self.location.origin &&
    !/\/(rest|auth|api|rpc|storage|functions)\//i.test(url.pathname);
}

function handleSameOriginGetFetch(event, request, url) {
  if (request.mode === 'navigate') {
    handleNavigationFetch(event, request, url);
    return;
  }
  handleStaticAssetFetch(event, request, url);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (!shouldHandleSameOriginGet(request, url)) return;
  handleSameOriginGetFetch(event, request, url);
});

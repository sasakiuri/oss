/*
 * Offline support for Nilay Labs (/labs and the tools under it).
 *
 * Registered by the Labs pages with the scope /labs and the build's version in the query string
 * (labs-sw.js?v=<version>). Each version keeps one cache, named after it.
 *
 * - Pages under /labs: from the network first, so a reader online always gets the current page; the
 *   copy is kept (without its query string) and served when the network fails or is too slow.
 * - /_next/static: file names carry a content hash, so a cached copy is served as it is.
 * - Pictures and other files with an extension, and /_next/image: served from the cache and refreshed
 *   from the network in the background. An optimised picture that was never fetched at this width falls
 *   back to one that was, or to the original file.
 * - /api/*, the React Server Components requests of client-side navigation, other origins and anything
 *   but GET are never touched. When a client-side navigation fails offline, Next.js falls back to an
 *   ordinary page load, which this worker answers from the cache.
 *
 * A new version installs by fetching again every page the old version had kept, and the files those
 * pages load, into its own cache. If that fails (offline, or the server fails), the install fails and
 * the old version stays in charge until the next attempt. Once it succeeds, the new version takes over
 * at once and deletes the older caches, so the pages a reader had opened stay usable offline across
 * updates and nothing from an old build is kept.
 */

const CACHE_PREFIX = 'nilay-labs-offline-';
/** Set by the page that registers the worker. Without it the worker refuses to install (see the install handler). */
const VERSION = new URL(self.location.href).searchParams.get('v');
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
/** How long a page request may take before the kept copy is shown instead. Weak signal is common in the field. */
const NAVIGATION_TIMEOUT_MS = 4000;
/** The most files one page may ask to have kept, so a message cannot fill the storage. */
const MAX_CACHE_URLS = 300;

const inScope = (pathname) => pathname === SCOPE_PATH || pathname.startsWith(`${SCOPE_PATH}/`);
const pageKey = (url) => new URL(url.pathname, url.origin).href;
const isServerComponentsRequest = (request, url) => request.headers.has('rsc') || url.searchParams.has('_rsc');

/** How a request is answered, or null when the worker leaves it to the browser. */
function strategyOf(request) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  if (url.pathname.startsWith('/api/') || url.pathname === '/labs-sw.js') return null;
  if (isServerComponentsRequest(request, url)) return null;
  if (request.mode === 'navigate') return inScope(url.pathname) ? 'page' : null;
  if (url.pathname.startsWith('/_next/static/')) return 'immutable';
  if (url.pathname === '/_next/image') return 'image';
  if (/\.[a-z0-9]+$/i.test(url.pathname) && !url.pathname.startsWith('/_next/')) return 'asset';
  return null;
}

const keepable = (response) => response.ok && response.type === 'basic';

/**
 * Keeps a copy while answering a request. Best effort: a full quota must not cost the reader the
 * response that has already arrived, so a failed write is let go.
 */
async function put(cache, key, response) {
  if (!keepable(response)) return;
  try {
    await cache.put(key, response);
  } catch {
    // Kept the next time there is room.
  }
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
}

async function answerPage(event) {
  const url = new URL(event.request.url);
  const key = pageKey(url);
  const cache = await caches.open(CACHE_NAME);
  const network = fetch(event.request).then(async (response) => {
    const type = response.headers.get('content-type') || '';
    if (type.includes('text/html')) await put(cache, key, response.clone());
    return response;
  });
  // Kept alive after an early answer, so the fresh copy still lands in the cache.
  event.waitUntil(network.catch(() => undefined));
  const first = await Promise.race([network.catch(() => 'failed'), timeout(NAVIGATION_TIMEOUT_MS)]);
  if (first instanceof Response) return first;
  const kept = await caches.match(key, { ignoreSearch: true, ignoreVary: true });
  if (kept) return kept;
  // Nothing kept: a slow network is still the only answer there is.
  return network;
}

async function answerImmutable(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await put(await caches.open(CACHE_NAME), request, response.clone());
  return response;
}

/** Any kept /_next/image of the same picture, or the original file. */
async function imageFallback(url) {
  const original = url.searchParams.get('url');
  if (!original) return undefined;
  const cache = await caches.open(CACHE_NAME);
  for (const request of await cache.keys()) {
    const kept = new URL(request.url);
    if (kept.pathname === '/_next/image' && kept.searchParams.get('url') === original) return cache.match(request);
  }
  if (original.startsWith('/')) return caches.match(new URL(original, url.origin).href);
  return undefined;
}

async function answerImage(event) {
  const cached = await caches.match(event.request);
  if (cached) return cached;
  try {
    const response = await fetch(event.request);
    await put(await caches.open(CACHE_NAME), event.request, response.clone());
    return response;
  } catch (error) {
    const fallback = await imageFallback(new URL(event.request.url));
    if (fallback) return fallback;
    throw error;
  }
}

async function answerAsset(event) {
  const cache = await caches.open(CACHE_NAME);
  const refresh = fetch(event.request).then(async (response) => {
    await put(cache, event.request, response.clone());
    return response;
  });
  const cached = await caches.match(event.request);
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  if (!VERSION) return;
  const strategy = strategyOf(event.request);
  if (strategy === 'page') event.respondWith(answerPage(event));
  else if (strategy === 'immutable') event.respondWith(answerImmutable(event.request));
  else if (strategy === 'image') event.respondWith(answerImage(event));
  else if (strategy === 'asset') event.respondWith(answerAsset(event));
});

/** The build files a page loads: scripts, styles and fonts, as its HTML and its styles name them. */
function staticFilesIn(text) {
  const files = new Set();
  for (const match of text.matchAll(/(?:\/_next\/)?(static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./~%@[\]]+?\.(?:js|css|woff2?))/g))
    files.add(`/_next/${match[1]}`);
  return [...files];
}

/**
 * Keeps one page and the scripts and styles it loads. A page that is gone (404) is dropped. Anything
 * else that cannot be fetched or kept (the page, one of its scripts or styles, or room in the cache)
 * fails the install: the new version would take over and delete the old cache, and a page without its
 * scripts would not start offline. Fonts named in the styles are kept as far as they can be, since a
 * page still works in a fallback font.
 */
async function keepPage(cache, path) {
  const response = await fetch(new Request(path, { credentials: 'same-origin' }));
  if (response.status === 404) return;
  if (!keepable(response)) throw new Error(`Could not fetch ${path}`);
  await cache.put(pageKey(new URL(path, self.location.origin)), response.clone());
  const files = staticFilesIn(await response.text());
  await Promise.all(
    files.map(async (file) => {
      const asset = await fetch(file);
      if (!keepable(asset)) throw new Error(`Could not fetch ${file}, which ${path} loads`);
      await cache.put(file, asset.clone());
      if (file.endsWith('.css')) {
        const fonts = staticFilesIn(await asset.text()).filter((name) => !name.endsWith('.css'));
        await Promise.all(fonts.map((font) => cache.add(font).catch(() => undefined)));
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // A worker without a version would share one cache across builds and never retire the old files.
      if (!VERSION) throw new Error('labs-sw.js must be registered with ?v=<version>');
      const cache = await caches.open(CACHE_NAME);
      const pages = new Set([SCOPE_PATH]);
      for (const name of await caches.keys()) {
        if (!name.startsWith(CACHE_PREFIX) || name === CACHE_NAME) continue;
        for (const request of await (await caches.open(name)).keys()) {
          const url = new URL(request.url);
          if (url.origin === self.location.origin && inScope(url.pathname)) pages.add(url.pathname);
        }
      }
      try {
        await Promise.all([...pages].map((path) => keepPage(cache, path)));
      } catch (error) {
        // A half-filled cache is of no use to the next attempt, which starts over.
        await caches.delete(CACHE_NAME);
        throw error;
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

/** A page asks for files it will need offline but has not loaded yet, such as every photo of a test. */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!VERSION || !data) return;
  // The page that is open asks to be kept, with the files it loads. Its own load may have come before
  // this worker was in charge (the first visit, or a worker still activating), and then it would not
  // have been kept on the way in.
  if (data.type === 'keep-page' && typeof data.path === 'string') {
    const url = new URL(data.path, self.location.origin);
    if (url.origin !== self.location.origin || !inScope(url.pathname)) return;
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        if (await cache.match(pageKey(url))) return;
        try {
          await keepPage(cache, url.pathname);
        } catch {
          // Offline now, or out of room; kept the next time the page opens online.
        }
      })(),
    );
    return;
  }
  if (data.type !== 'cache-urls' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      for (const value of data.urls.slice(0, MAX_CACHE_URLS)) {
        if (typeof value !== 'string') continue;
        const url = new URL(value, self.location.origin);
        const request = new Request(url.href);
        if (strategyOf(request) === null || (await cache.match(request))) continue;
        try {
          await put(cache, request, await fetch(request));
        } catch {
          // Offline now; asked again the next time the page opens.
        }
      }
    })(),
  );
});

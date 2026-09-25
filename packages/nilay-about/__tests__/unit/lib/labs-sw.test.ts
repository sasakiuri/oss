import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

/**
 * public/labs-sw.js, run in a sandbox that stands in for a service worker's global scope: the Cache
 * API is an in-memory map, and fetch is whatever each test says the network does.
 */

const ORIGIN = 'https://labs.example';
const source = readFileSync(join(__dirname, '../../../public/labs-sw.js'), 'utf8');

/** Responses from the network are same-origin (`basic`), which a Response made in a test is not. */
function basic(response: Response): Response {
  Object.defineProperty(response, 'type', { value: 'basic' });
  const clone = response.clone.bind(response);
  Object.defineProperty(response, 'clone', { value: () => basic(clone()) });
  return response;
}
const html = (body: string, status = 200) =>
  basic(new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } }));
const file = (body: string, type = 'application/javascript') =>
  basic(new Response(body, { headers: { 'content-type': type } }));

type RequestLike = { url: string; method: string; mode: string; headers: Headers };
const urlOf = (request: RequestLike | Request | string) =>
  typeof request === 'string' ? new URL(request, ORIGIN).href : request.url;

class FakeCache {
  entries = new Map<string, Response>();
  match(request: RequestLike | string, options: { ignoreSearch?: boolean } = {}) {
    const wanted = new URL(urlOf(request));
    for (const [key, response] of this.entries) {
      const kept = new URL(key);
      const same = options.ignoreSearch
        ? kept.origin + kept.pathname === wanted.origin + wanted.pathname
        : key === wanted.href;
      if (same) return Promise.resolve(response.clone());
    }
    return Promise.resolve(undefined);
  }
  put(request: RequestLike | string, response: Response) {
    if (quotaFull) return Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    this.entries.set(urlOf(request), response);
    return Promise.resolve();
  }
  async add(request: string) {
    this.entries.set(urlOf(request), await network(new Request(urlOf(request))));
  }
  keys() {
    return Promise.resolve([...this.entries.keys()].map((url) => new Request(url)));
  }
}

let quotaFull = false;
let network: (request: Request | RequestLike) => Promise<Response> = () => Promise.reject(new TypeError('offline'));

function start(version: string | null = 'v1', stores = new Map<string, FakeCache>()) {
  const listeners = new Map<string, (event: unknown) => void>();
  const caches = {
    stores,
    open: (name: string) => {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return Promise.resolve(stores.get(name)!);
    },
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name: string) => Promise.resolve(stores.delete(name)),
    match: async (request: RequestLike | string, options?: { ignoreSearch?: boolean }) => {
      for (const cache of stores.values()) {
        const found = await cache.match(request, options);
        if (found) return found;
      }
      return undefined;
    },
  };
  const self = {
    location: new URL(version === null ? `${ORIGIN}/labs-sw.js` : `${ORIGIN}/labs-sw.js?v=${version}`),
    registration: { scope: `${ORIGIN}/labs` },
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: { claim: vi.fn(() => Promise.resolve()) },
  };
  class SandboxRequest extends Request {
    constructor(input: string | URL, init?: RequestInit) {
      super(new URL(String(input), ORIGIN), init);
    }
  }
  runInNewContext(source, {
    self,
    caches,
    fetch: (request: Request | RequestLike) => network(request),
    Request: SandboxRequest,
    Response,
    URL,
    Set,
    Promise,
    // A slow network is simulated by answering the timer at once.
    setTimeout: (callback: () => void) => callback(),
  });

  /** Fires an event; `answer` settles with the response, `done` once every waitUntil has too. */
  const fire = (type: string, extra: Record<string, unknown>) => {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get(type)!({
      ...extra,
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      respondWith: (promise: Promise<Response>) => {
        response = promise;
      },
    });
    const answer = response ?? Promise.resolve(undefined);
    return { answer, done: answer.then(() => Promise.all(pending)) };
  };
  const dispatch = async (type: string, extra: Record<string, unknown>) => {
    const { answer, done } = fire(type, extra);
    await done;
    return answer;
  };
  const fetchRequest = (path: string, init: { mode?: string; method?: string; headers?: Record<string, string> }) => ({
    request: {
      url: new URL(path, ORIGIN).href,
      method: init.method ?? 'GET',
      mode: init.mode ?? 'cors',
      headers: new Headers(init.headers),
    },
  });
  const fetchEvent = (path: string, init: { mode?: string; method?: string; headers?: Record<string, string> } = {}) =>
    dispatch('fetch', {
      request: {
        url: new URL(path, ORIGIN).href,
        method: init.method ?? 'GET',
        mode: init.mode ?? 'cors',
        headers: new Headers(init.headers),
      },
    });
  const fetchEarly = (path: string, init: { mode?: string } = {}) => fire('fetch', fetchRequest(path, init));
  return { caches, self, dispatch, fetchEvent, fetchEarly, cacheName: `nilay-labs-offline-${version}` };
}

describe('the Labs service worker', () => {
  it('serves a page from the network while online, and the kept copy (without its query) once offline', async () => {
    const worker = start();
    network = () => Promise.resolve(html('<p>fresh</p>'));
    const online = await worker.fetchEvent('/labs/twist-stability?muzzleSpeed=800&speedUnit=mps', { mode: 'navigate' });
    expect(await online!.text()).toBe('<p>fresh</p>');
    expect([...worker.caches.stores.get(worker.cacheName)!.entries.keys()]).toEqual([`${ORIGIN}/labs/twist-stability`]);

    network = () => Promise.reject(new TypeError('offline'));
    const offline = await worker.fetchEvent('/labs/twist-stability', { mode: 'navigate' });
    expect(await offline!.text()).toBe('<p>fresh</p>');
  });

  it('shows the kept page when the network is too slow, and still keeps the fresh one when it arrives', async () => {
    const worker = start();
    network = () => Promise.resolve(html('old'));
    await worker.fetchEvent('/labs', { mode: 'navigate' });
    let arrive: (response: Response) => void = () => undefined;
    network = () => new Promise((resolve) => (arrive = resolve));
    const { answer, done } = worker.fetchEarly('/labs', { mode: 'navigate' });
    // The kept copy is handed out before the network has answered.
    expect(await (await answer)!.text()).toBe('old');
    arrive(html('new'));
    await done;
    expect(await (await worker.caches.match(`${ORIGIN}/labs`))!.text()).toBe('new');
  });

  it('does not keep an error page', async () => {
    const worker = start();
    network = () => Promise.resolve(html('broken', 500));
    const answer = await worker.fetchEvent('/labs/recoil', { mode: 'navigate' });
    expect(answer!.status).toBe(500);
    expect(worker.caches.stores.get(worker.cacheName)!.entries.size).toBe(0);
  });

  it('leaves the API, server component requests, other methods and pages outside Labs to the browser', async () => {
    const worker = start();
    const seen = vi.fn(() => Promise.resolve(html('x')));
    network = seen;
    expect(await worker.fetchEvent('/api/home-targets')).toBeUndefined();
    expect(await worker.fetchEvent('/api/home-targets', { method: 'POST' })).toBeUndefined();
    expect(await worker.fetchEvent('/labs/recoil?_rsc=abc')).toBeUndefined();
    expect(await worker.fetchEvent('/labs/recoil', { headers: { RSC: '1' } })).toBeUndefined();
    expect(await worker.fetchEvent('/news', { mode: 'navigate' })).toBeUndefined();
    expect(await worker.fetchEvent('https://cdn.nilay.jp/a.png')).toBeUndefined();
    expect(await worker.fetchEvent('/labs-sw.js?v=v1')).toBeUndefined();
    expect(seen).not.toHaveBeenCalled();
  });

  it('keeps a build file after the first load and serves it without the network', async () => {
    const worker = start();
    network = () => Promise.resolve(file('chunk'));
    await worker.fetchEvent('/_next/static/chunks/abc.js');
    network = () => Promise.reject(new TypeError('offline'));
    expect(await (await worker.fetchEvent('/_next/static/chunks/abc.js'))!.text()).toBe('chunk');
  });

  it('answers an optimised picture offline from another width of it, or from the original file', async () => {
    const worker = start();
    network = () => Promise.resolve(file('w640', 'image/webp'));
    await worker.fetchEvent('/_next/image?url=%2Fimages%2Fa.jpg&w=640&q=75');
    network = () => Promise.resolve(file('original', 'image/jpeg'));
    await worker.fetchEvent('/images/b.jpg');

    network = () => Promise.reject(new TypeError('offline'));
    expect(await (await worker.fetchEvent('/_next/image?url=%2Fimages%2Fa.jpg&w=1080&q=75'))!.text()).toBe('w640');
    expect(await (await worker.fetchEvent('/_next/image?url=%2Fimages%2Fb.jpg&w=1080&q=75'))!.text()).toBe('original');
  });

  it('keeps the page that asks, with the files it loads, when its own load came before the worker', async () => {
    const worker = start();
    network = (request) => {
      const url = new URL(urlOf(request));
      if (url.pathname === '/labs/tool')
        return Promise.resolve(html('<script src="/_next/static/chunks/tool.js"></script>'));
      return Promise.resolve(file(url.pathname));
    };
    await worker.dispatch('message', { data: { type: 'keep-page', path: '/labs/tool' } });
    await worker.dispatch('message', { data: { type: 'keep-page', path: '/news' } });
    expect([...worker.caches.stores.get(worker.cacheName)!.entries.keys()].sort()).toEqual([
      `${ORIGIN}/_next/static/chunks/tool.js`,
      `${ORIGIN}/labs/tool`,
    ]);
    network = () => Promise.reject(new TypeError('offline'));
    expect(await (await worker.fetchEvent('/labs/tool', { mode: 'navigate' }))!.text()).toContain('tool.js');
  });

  it('keeps the files a page asks for ahead of time, and nothing it would not cache anyway', async () => {
    const worker = start();
    const seen: string[] = [];
    network = (request) => {
      seen.push(urlOf(request));
      return Promise.resolve(file('img', 'image/jpeg'));
    };
    await worker.dispatch('message', {
      data: {
        type: 'cache-urls',
        urls: ['/images/game-species/001_001.jpg', '/api/secret', 'https://other.example/x.jpg'],
      },
    });
    expect(seen).toEqual([`${ORIGIN}/images/game-species/001_001.jpg`]);
    network = () => Promise.reject(new TypeError('offline'));
    expect(await (await worker.fetchEvent('/images/game-species/001_001.jpg'))!.text()).toBe('img');
  });

  it('installs a new version by fetching again the pages the old one kept and the files they load', async () => {
    const stores = new Map<string, FakeCache>();
    const old = start('v1', stores);
    network = () => Promise.resolve(html('v1 page'));
    await old.fetchEvent('/labs/recoil', { mode: 'navigate' });
    await old.dispatch('activate', {});

    const next = start('v2', stores);
    network = (request) => {
      const url = new URL(urlOf(request));
      if (url.pathname === '/labs' || url.pathname === '/labs/recoil')
        return Promise.resolve(
          html(
            `<link rel="stylesheet" href="/_next/static/css/app.css"><script src="/_next/static/chunks/main.js"></script>` +
              `<script>self.__next_f.push([1,"1:I[1,[\\"static/chunks/page.js\\"],\\"Recoil\\"]"])</script>`,
          ),
        );
      if (url.pathname === '/_next/static/css/app.css')
        return Promise.resolve(file('@font-face{src:url(/_next/static/media/font.woff2)}', 'text/css'));
      return Promise.resolve(file(url.pathname));
    };
    await next.dispatch('install', {});
    expect(next.self.skipWaiting).toHaveBeenCalled();
    expect([...stores.get(next.cacheName)!.entries.keys()].sort()).toEqual(
      [
        `${ORIGIN}/labs`,
        `${ORIGIN}/labs/recoil`,
        `${ORIGIN}/_next/static/chunks/main.js`,
        `${ORIGIN}/_next/static/chunks/page.js`,
        `${ORIGIN}/_next/static/css/app.css`,
        `${ORIGIN}/_next/static/media/font.woff2`,
      ].sort(),
    );

    await next.dispatch('activate', {});
    expect([...stores.keys()]).toEqual([next.cacheName]);
    expect(next.self.clients.claim).toHaveBeenCalled();
  });

  it('fails the install while offline, so the working version stays in charge', async () => {
    const worker = start('v2');
    network = () => Promise.reject(new TypeError('offline'));
    await expect(worker.dispatch('install', {})).rejects.toThrow('offline');
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('still answers with what the network returned when the cache is full', async () => {
    const worker = start();
    quotaFull = true;
    try {
      network = () => Promise.resolve(html('page'));
      expect(await (await worker.fetchEvent('/labs/recoil', { mode: 'navigate' }))!.text()).toBe('page');
      network = () => Promise.resolve(file('chunk'));
      expect(await (await worker.fetchEvent('/_next/static/chunks/a.js'))!.text()).toBe('chunk');
      network = () => Promise.resolve(file('img', 'image/webp'));
      expect(await (await worker.fetchEvent('/_next/image?url=%2Fimages%2Fa.jpg&w=640'))!.text()).toBe('img');
      network = () => Promise.resolve(file('png', 'image/png'));
      expect(await (await worker.fetchEvent('/images/a.png'))!.text()).toBe('png');
    } finally {
      quotaFull = false;
    }
  });

  it('fails the install and keeps the old cache when a script a kept page loads cannot be fetched', async () => {
    const stores = new Map<string, FakeCache>();
    const old = start('v1', stores);
    network = () => Promise.resolve(html('v1 page'));
    await old.fetchEvent('/labs/recoil', { mode: 'navigate' });
    const next = start('v2', stores);
    network = (request) => {
      const url = new URL(urlOf(request));
      if (url.pathname.startsWith('/labs'))
        return Promise.resolve(html('<script src="/_next/static/chunks/main.js"></script>'));
      return Promise.resolve(basic(new Response('', { status: 503 })));
    };
    await expect(next.dispatch('install', {})).rejects.toThrow('main.js');
    expect(next.self.skipWaiting).not.toHaveBeenCalled();
    expect([...stores.keys()]).toEqual([old.cacheName]);
  });

  it('fails the install when the cache is full, and keeps the old cache', async () => {
    const stores = new Map<string, FakeCache>();
    const old = start('v1', stores);
    network = () => Promise.resolve(html('v1 page'));
    await old.fetchEvent('/labs', { mode: 'navigate' });
    const next = start('v2', stores);
    quotaFull = true;
    try {
      await expect(next.dispatch('install', {})).rejects.toThrow();
    } finally {
      quotaFull = false;
    }
    expect([...stores.keys()]).toEqual([old.cacheName]);
  });

  it('refuses to install, and answers nothing, without a version', async () => {
    const worker = start(null);
    network = () => Promise.resolve(html('list'));
    await expect(worker.dispatch('install', {})).rejects.toThrow('?v=');
    expect(await worker.fetchEvent('/labs', { mode: 'navigate' })).toBeUndefined();
  });

  it('drops a page that no longer exists instead of failing the install', async () => {
    const stores = new Map<string, FakeCache>();
    const old = start('v1', stores);
    network = () => Promise.resolve(html('gone soon'));
    await old.fetchEvent('/labs/retired-tool', { mode: 'navigate' });
    const next = start('v2', stores);
    network = (request) =>
      Promise.resolve(new URL(urlOf(request)).pathname === '/labs' ? html('list') : html('missing', 404));
    await next.dispatch('install', {});
    expect([...stores.get(next.cacheName)!.entries.keys()]).toEqual([`${ORIGIN}/labs`]);
  });
});

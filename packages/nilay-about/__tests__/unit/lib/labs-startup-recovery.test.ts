import { runInNewContext } from 'node:vm';

import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { labsStartupRecoveryScript } from '@/lib/labs-startup-recovery';

const pages: JSDOM[] = [];
afterEach(() => {
  for (const page of pages.splice(0)) page.window.close();
});

function setup(options: { tried?: boolean; storageBlocked?: boolean; path?: string; preloads?: string[] } = {}) {
  const url = `https://about.example${options.path ?? '/labs/unit-converter?unit=m#result'}`;
  const page = new JSDOM(
    '<div data-labs-startup-failure hidden><button>Reload</button></div>' +
      '<div data-labs-startup-content><div aria-busy="true" inert><input value="saved" /></div></div>',
    { url },
  );
  pages.push(page);
  const { window } = page;
  for (const href of options.preloads ?? []) {
    const link = window.document.createElement('link');
    link.rel = 'preload';
    link.setAttribute('as', 'script');
    link.href = href;
    window.document.head.append(link);
  }
  Object.defineProperty(window.document, 'readyState', { configurable: true, value: 'complete' });
  const key = `nilay-labs-startup-retry:${url}`;
  if (options.tried) window.sessionStorage.setItem(key, '1');
  const reload = vi.fn();
  const fetchAsset = vi.fn<typeof fetch>();
  const tasks: (() => void)[] = [];
  const storage = options.storageBlocked
    ? {
        getItem: () => {
          throw new Error('blocked');
        },
      }
    : window.sessionStorage;
  runInNewContext(labsStartupRecoveryScript, {
    window,
    document: window.document,
    location: { ...new URL(url), href: url, pathname: new URL(url).pathname, origin: new URL(url).origin, reload },
    sessionStorage: storage,
    HTMLScriptElement: window.HTMLScriptElement,
    MutationObserver: window.MutationObserver,
    URL,
    fetch: fetchAsset,
    AbortController,
    clearTimeout: vi.fn(),
    setTimeout: (task: () => void) => tasks.push(task),
  });
  function fail(src = '/_next/static/chunks/app.js') {
    const script = window.document.createElement('script');
    script.src = src;
    window.document.body.append(script);
    script.dispatchEvent(new window.Event('error'));
  }
  return { window, key, reload, tasks, fail, fetchAsset };
}

describe('pre-hydration Labs asset recovery', () => {
  it('reloads once for failed framework assets and retains saved controls as inert', () => {
    const { window, tasks, fail, key, reload } = setup();
    fail();
    fail('/_next/static/chunks/other.js');
    expect(tasks).toHaveLength(1);
    expect(window.sessionStorage.getItem(key)).toBe('1');
    tasks[0]?.();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.document.querySelector('[aria-busy="true"]')?.hasAttribute('inert')).toBe(true);
    expect(window.document.querySelector('input')?.value).toBe('saved');
  });

  it.each([{ tried: true }, { storageBlocked: true }])('shows a bounded failure when %j', (options) => {
    const { window, fail, tasks, reload } = setup(options);
    fail();
    expect(tasks).toHaveLength(0);
    expect(window.document.querySelector<HTMLElement>('[data-labs-startup-failure]')?.hidden).toBe(false);
    expect(window.document.querySelector<HTMLElement>('[data-labs-startup-content]')?.hidden).toBe(true);
    window.document.querySelector('button')?.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores ordinary errors, external scripts and other page assets', () => {
    const { window, fail, tasks } = setup();
    window.dispatchEvent(new window.ErrorEvent('error', { message: 'application error' }));
    fail('https://other.example/_next/static/chunks/app.js');
    fail('/other-script.js');
    expect(tasks).toHaveLength(0);
    expect(window.document.querySelector<HTMLElement>('[data-labs-startup-failure]')?.hidden).toBe(true);
  });

  it('waits for saved-state readiness before retiring the guard', async () => {
    const { window, fail, tasks, key } = setup({ tried: true });
    window.dispatchEvent(new window.Event('nilay-labs-startup-ready'));
    expect(window.sessionStorage.getItem(key)).toBe('1');
    window.document.querySelector('[aria-busy]')?.setAttribute('aria-busy', 'false');
    await Promise.resolve();
    expect(window.sessionStorage.getItem(key)).toBeNull();
    fail();
    expect(tasks).toHaveLength(0);
    expect(window.document.querySelector<HTMLElement>('[data-labs-startup-failure]')?.hidden).toBe(true);
  });

  it('does not recover assets on other site pages', () => {
    const { fail, tasks } = setup({ path: '/' });
    fail();
    expect(tasks).toHaveLength(0);
  });

  it('refreshes framework script preloads and consumes their bodies before reloading', async () => {
    const { window, fetchAsset, fail, tasks, reload } = setup({
      preloads: [
        '/_next/static/chunks/one.js',
        '/_next/static/chunks/two.js',
        'https://other.example/_next/static/chunks/external.js',
        '/other-script.js',
      ],
    });
    let completeBody!: () => void;
    const body = new Promise<ArrayBuffer>((resolve) => {
      completeBody = () => resolve(new ArrayBuffer(0));
    });
    fetchAsset.mockResolvedValue({ arrayBuffer: () => body } as Response);
    fail();
    tasks[0]?.();
    await Promise.resolve();
    expect(fetchAsset.mock.calls.map(([url]) => url)).toEqual([
      'https://about.example/_next/static/chunks/one.js',
      'https://about.example/_next/static/chunks/two.js',
    ]);
    expect(fetchAsset.mock.calls.every(([, init]) => init?.cache === 'reload')).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    completeBody();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(window.document.querySelector('input')?.value).toBe('saved');
  });

  it('still reloads after a failed preload refresh on a manual retry', async () => {
    const { window, fetchAsset, fail, key, reload } = setup({
      tried: true,
      preloads: ['/_next/static/chunks/app.js'],
    });
    fetchAsset.mockRejectedValue(new TypeError('network unavailable'));
    fail();
    window.document.querySelector('button')?.click();
    window.document.querySelector('button')?.click();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it('bounds a stalled preload refresh and ignores its late completion', async () => {
    const { fetchAsset, fail, tasks, reload } = setup({ preloads: ['/_next/static/chunks/app.js'] });
    let completeFetch!: (response: Response) => void;
    fetchAsset.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          completeFetch = resolve;
        }),
    );
    fail();
    tasks[0]?.();
    const signal = fetchAsset.mock.calls[0]?.[1]?.signal;
    expect(reload).not.toHaveBeenCalled();
    tasks[1]?.();
    expect(signal?.aborted).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    completeFetch({ arrayBuffer: async () => new ArrayBuffer(0) } as Response);
    await vi.waitFor(() => expect(fetchAsset).toHaveResolved());
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

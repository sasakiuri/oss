import { runInNewContext } from 'node:vm';

import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { labsStartupRecoveryScript } from '@/lib/labs-startup-recovery';

const pages: JSDOM[] = [];
afterEach(() => {
  for (const page of pages.splice(0)) page.window.close();
});

function setup(options: { tried?: boolean; storageBlocked?: boolean; path?: string } = {}) {
  const url = `https://about.example${options.path ?? '/labs/unit-converter?unit=m#result'}`;
  const page = new JSDOM(
    '<div data-labs-startup-failure hidden><button>Reload</button></div>' +
      '<div data-labs-startup-content><div aria-busy="true" inert><input value="saved" /></div></div>',
    { url },
  );
  pages.push(page);
  const { window } = page;
  Object.defineProperty(window.document, 'readyState', { configurable: true, value: 'complete' });
  const key = `nilay-labs-startup-retry:${url}`;
  if (options.tried) window.sessionStorage.setItem(key, '1');
  const reload = vi.fn();
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
    setTimeout: (task: () => void) => tasks.push(task),
  });
  function fail(src = '/_next/static/chunks/app.js') {
    const script = window.document.createElement('script');
    script.src = src;
    window.document.body.append(script);
    script.dispatchEvent(new window.Event('error'));
  }
  return { window, key, reload, tasks, fail };
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
});

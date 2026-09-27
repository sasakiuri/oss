import { test as base, expect, type Page } from '@playwright/test';

/**
 * The Labs tools are rendered on the server with their defaults and held `aria-busy` (and inert)
 * until the browser has read the saved state. A reader cannot type before then, but Playwright can,
 * and what it types would be replaced, so every load waits for the page to settle first.
 * Only `goto` and `reload` wait: after following a link, wait for the page before filling it in.
 */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    // Readiness is part of navigation, bounded by the existing action/test deadline.
    // Waiting for the selector to disappear also includes hidden busy regions.
    const settle = () => page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached' });
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    page.goto = async (...args) => {
      const response = await goto(...args);
      await settle();
      return response;
    };
    page.reload = async (...args) => {
      const response = await reload(...args);
      await settle();
      return response;
    };
    // Temporary diagnostics: record, without tracing, the loads that fail before hydration can finish.
    // Failed loads, error responses, page errors and crashes are all kept; console errors are capped.
    const network: object[] = [];
    const pending = new Map<object, object>();
    const consoleErrors = { kept: 0, dropped: 0 };
    if (process.platform === 'win32') {
      const started = Date.now();
      const note = (entry: object) => network.push({ at: Date.now() - started, ...entry });
      page.on('request', (request) =>
        pending.set(request, { at: Date.now() - started, url: request.url(), type: request.resourceType() }),
      );
      page.on('requestfinished', (request) => pending.delete(request));
      page.on('requestfailed', (request) => {
        pending.delete(request);
        note({ failed: request.url(), type: request.resourceType(), error: request.failure()?.errorText });
      });
      page.on('response', (response) => {
        if (response.status() >= 400) note({ status: response.status(), url: response.url() });
      });
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        if (consoleErrors.kept === 50) {
          consoleErrors.dropped += 1;
          return;
        }
        consoleErrors.kept += 1;
        note({ console: message.text().slice(0, 2000) });
      });
      page.on('pageerror', (error) => note({ pageError: String(error).slice(0, 2000) }));
      page.on('crash', () => note({ crash: true }));
    }
    try {
      await use(page); // eslint-disable-line react-hooks/rules-of-hooks -- Playwright fixture, not a React hook
    } finally {
      // Temporary diagnostics on the unmerged verification branch; do not interact with the page.
      if (process.platform === 'win32' && testInfo.status !== testInfo.expectedStatus) {
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          const snapshot = await Promise.race([
            page.evaluate(async () => {
              const reactKeys = (node: Element | Document | null) =>
                node ? Object.keys(node).filter((key) => /^__react(Fiber|Props|Container)/.test(key)) : [];
              const state = {
                url: location.href,
                readyState: document.readyState,
                visibility: document.visibilityState,
                busy: [...document.querySelectorAll('[aria-busy="true"]')].map((node) => ({
                  tag: node.tagName,
                  reactKeys: reactKeys(node),
                })),
                controlReactKeys: reactKeys(document.querySelector('input, button')),
                busyControlReactKeys: reactKeys(
                  document.querySelector('[aria-busy="true"] input, [aria-busy="true"] button'),
                ),
                documentReactKeys: reactKeys(document),
                bodyReactKeys: reactKeys(document.body),
                rootReactKeys: reactKeys(document.documentElement),
                labsBarHeight: document.documentElement.style.getPropertyValue('--labs-bar-height'),
                statuses: [...document.querySelectorAll('[role="status"]')].map((node) => node.textContent),
                scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
                chunks: performance
                  .getEntriesByType('resource')
                  .filter((entry) => entry.name.includes('/_next/static/chunks/'))
                  .map((entry) => {
                    const { name, duration, responseStatus, transferSize } = entry as PerformanceResourceTiming;
                    return { name, duration: Math.round(duration), responseStatus, transferSize };
                  }),
              };
              // A load that failed at the network may leave no timing entry at all.
              const timed = new Set(state.chunks.map((chunk) => chunk.name));
              const untimedChunks = state.scripts.filter(
                (src) => src.includes('/_next/static/chunks/') && !timed.has(src),
              );
              let lockDeadline: ReturnType<typeof setTimeout> | undefined;
              try {
                const locks = navigator.locks
                  ? await Promise.race([
                      navigator.locks.query(),
                      new Promise((resolve) => {
                        lockDeadline = setTimeout(() => resolve('query timed out'), 500);
                      }),
                    ])
                  : 'unavailable';
                return { ...state, untimedChunks, locks };
              } finally {
                clearTimeout(lockDeadline);
              }
            }),
            new Promise((resolve) => {
              deadline = setTimeout(() => resolve({ diagnostic: 'page inspection timed out' }), 1000);
            }),
          ]);
          await testInfo.attach('initialization-state', {
            body: JSON.stringify(snapshot, null, 2),
            contentType: 'application/json',
          });
        } catch (error) {
          await testInfo.attach('initialization-state', {
            body: String(error),
            contentType: 'text/plain',
          });
        } finally {
          clearTimeout(deadline);
        }
        await testInfo.attach('network-state', {
          body: JSON.stringify({ network, consoleErrors, pending: [...pending.values()] }, null, 2),
          contentType: 'application/json',
        });
      }
    }
  },
});

export { expect, type Page };

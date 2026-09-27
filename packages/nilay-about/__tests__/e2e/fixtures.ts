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
              };
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
                return { ...state, locks };
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
      }
    }
  },
});

export { expect, type Page };

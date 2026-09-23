import { test as base, expect, type Page } from '@playwright/test';

/**
 * The Labs tools are rendered on the server with their defaults and held `aria-busy` (and inert)
 * until the browser has read the saved state. A reader cannot type before then, but Playwright can,
 * and what it types would be replaced, so every load waits for the page to settle first.
 * Only `goto` and `reload` wait: after following a link, wait for the page before filling it in.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const settle = () => expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
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
    await use(page); // eslint-disable-line react-hooks/rules-of-hooks -- Playwright fixture, not a React hook
  },
});

export { expect, type Page };

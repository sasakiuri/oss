import { test, expect } from './fixtures';

test('navigation and reload wait for every busy region, including hidden regions', async ({ page }) => {
  let loads = 0;
  await page.route('**/__fixture/navigation-readiness', async (route) => {
    loads += 1;
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body data-load="${loads}">
        <div id="second" aria-busy="true">Reading language</div>
        <div id="first" aria-busy="true" hidden>Reading saved state</div>
      </body></html>`,
    });
  });

  for (const load of [1, 2]) {
    let finished = false;
    const navigating = load === 1 ? page.goto('/__fixture/navigation-readiness') : page.reload();
    const navigation = navigating.then(
      (response) => {
        finished = true;
        return { response, error: null };
      },
      (error: unknown) => {
        finished = true;
        return { response: null, error };
      },
    );
    await expect(page.locator('body')).toHaveAttribute('data-load', String(load));
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(2);
    expect(finished).toBe(false);
    await page.locator('#second').evaluate((element) => element.setAttribute('aria-busy', 'false'));
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(1);
    expect(finished).toBe(false);
    await page.locator('#first').evaluate((element) => element.setAttribute('aria-busy', 'false'));
    const result = await navigation;
    expect(result.error).toBeNull();
    expect(result.response?.ok()).toBe(true);
    expect(await page.locator('[aria-busy="true"]').count()).toBe(0);
  }
});

// SPDX-License-Identifier: MIT
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { closeDirector, launchDirector, type RunningDirector } from './fixtures';

test.describe('Accessibility', () => {
  let running: RunningDirector | undefined;

  test.afterEach(async () => closeDirector(running));

  test('has no automatically detectable WCAG 2.1 AA violations', async () => {
    running = await launchDirector();
    const window = await running.app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page: window })
      .setLegacyMode()
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

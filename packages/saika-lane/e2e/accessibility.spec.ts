// SPDX-License-Identifier: MIT
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { closeLane, launchLane, type RunningLane } from './fixtures';

test.describe('Accessibility', () => {
  let running: RunningLane | undefined;

  test.afterEach(async () => closeLane(running));

  test('should have no WCAG 2.1 AA violations', async () => {
    running = await launchLane();
    const window = await running.app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page: window })
      .setLegacyMode()
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

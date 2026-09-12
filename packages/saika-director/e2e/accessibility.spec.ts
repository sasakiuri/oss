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
    await expect(window.getByRole('heading', { name: 'Competition Control' })).toBeVisible();

    for (const screen of [
      'Competition Control',
      'Championships',
      'Target Examinations',
      'Range Interruptions',
      'Settings',
    ]) {
      await window.getByRole('button', { name: screen, exact: true }).click();
      const results = await new AxeBuilder({ page: window })
        .setLegacyMode()
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations, screen).toEqual([]);
    }
    for (const section of ['Competition', 'Vista', 'Backups', 'Updates']) {
      await window.getByRole('tab', { name: section, exact: true }).click();
      const results = await new AxeBuilder({ page: window })
        .setLegacyMode()
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations, section).toEqual([]);
    }
  });
});

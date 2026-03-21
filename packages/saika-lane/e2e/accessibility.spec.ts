// SPDX-License-Identifier: MIT
import path from 'path';
import { fileURLToPath } from 'url';

import AxeBuilder from '@axe-core/playwright';
import { type ElectronApplication, _electron as electron, expect, test } from '@playwright/test';
import electronPath from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Accessibility', () => {
  let app: ElectronApplication;

  test.afterEach(async () => {
    await app?.close();
  });

  test('should have no WCAG 2.1 AA violations', async () => {
    const appPath = path.resolve(__dirname, '../dist/main/main.js');
    app = await electron.launch({ executablePath: electronPath as unknown as string, args: [appPath] });

    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page: window })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

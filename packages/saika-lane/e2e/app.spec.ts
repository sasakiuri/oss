// SPDX-License-Identifier: MIT
import path from 'path';
import { fileURLToPath } from 'url';

import { _electron as electron, expect, test } from '@playwright/test';
import electronPath from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Saika Lane App', () => {
  test('should launch the app and display the main window', async () => {
    const appPath = path.resolve(__dirname, '../dist/main/main.js');
    const app = await electron.launch({ executablePath: electronPath as unknown as string, args: [appPath] });

    const window = await app.firstWindow();
    const title = await window.title();

    expect(title).toBeDefined();

    await app.close();
  });
});

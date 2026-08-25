// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import { closeLane, launchLane, type RunningLane } from './fixtures';

test.describe('Saika Lane App', () => {
  let running: RunningLane | undefined;

  test.afterEach(async () => closeLane(running));

  test('should launch the app and display the main window', async () => {
    running = await launchLane();
    const window = await running.app.firstWindow();
    const title = await window.title();

    expect(title).toBeDefined();
  });
});

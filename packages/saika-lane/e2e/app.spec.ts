// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import { closeLane, launchLane, type RunningLane } from './fixtures';

test.describe('Saika Lane App', () => {
  let running: RunningLane | undefined;

  test.afterEach(async () => closeLane(running));

  test('should launch the app and display the main window', async () => {
    running = await launchLane();
    const window = await running.app.firstWindow();
    await expect(window).toHaveTitle('Saika Lane');
    await expect(window.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    await expect(window.getByRole('main')).toBeVisible();
    await expect(window.getByText('No session started', { exact: true })).toHaveCount(0);
  });

  test('persists settings through the bridge without replacing its Lane identity', async () => {
    running = await launchLane();
    const page = await running.app.firstWindow();
    const initial = await page.evaluate(async () => {
      const api = window.electronAPI.settings;
      const response = await api.getAppSettings();
      if (!response.success) throw new Error(response.error.message);
      const saved = await api.saveAppSettings({
        ...response.data,
        userPreferences: { ...response.data.userPreferences, laneNumber: 12, audioVolume: 35 },
        mqtt: { ...response.data.mqtt, laneId: '22222222-2222-4222-8222-222222222222' },
      });
      if (!saved.success) throw new Error(saved.error?.message ?? 'Settings save failed without an error message');
      return response.data;
    });
    await page.reload();
    const persisted = await page.evaluate(async () => {
      const response = await window.electronAPI.settings.getAppSettings();
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    });
    expect(persisted.userPreferences).toMatchObject({ laneNumber: 12, audioVolume: 35 });
    expect(persisted.mqtt.laneId).toBe(initial.mqtt.laneId);
  });
});

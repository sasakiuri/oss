// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import { closeDirector, launchDirector, type RunningDirector } from './fixtures';

test.describe('Saika Director', () => {
  let running: RunningDirector | undefined;

  test.afterEach(async () => closeDirector(running));

  test('launches and exposes the main competition workflows', async () => {
    running = await launchDirector();
    const window = await running.app.firstWindow();

    await expect(window).toHaveTitle('Saika Director');
    await expect(window.getByRole('img', { name: 'Saika Director' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Competition Control' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Championship assignment' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Apply assignments' })).toBeDisabled();
    await expect(window.getByRole('button', { name: 'Championships' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Competition Control' })).toHaveAttribute('aria-current', 'page');
    await expect(window.getByRole('button', { name: 'MQTT Control' })).toHaveCount(0);
  });

  test('lets users enter an external broker URL before applying the mode', async () => {
    running = await launchDirector();
    const window = await running.app.firstWindow();

    await window.getByRole('button', { name: 'Settings' }).click();
    await window.getByRole('button', { name: 'External' }).click();

    const brokerUrl = window.getByLabel('Broker URL');
    await expect(brokerUrl).toBeEditable();
    await expect(window.getByText('Running', { exact: true })).toBeVisible();

    await brokerUrl.fill('');
    await expect(window.getByRole('button', { name: 'Save and connect' })).toBeDisabled();
    await brokerUrl.fill('mqtt://broker.example:1883');
    await expect(window.getByRole('button', { name: 'Save and connect' })).toBeEnabled();
  });

  test('quits the whole application when the main window closes with a board still open', async () => {
    test.skip(process.platform === 'darwin', 'macOS keeps the application active after closing its main window');
    running = await launchDirector();
    const mainWindow = await running.app.firstWindow();

    const boardWindowId = await mainWindow.evaluate(() => window.electronAPI.board.openRankingBoard());
    expect(boardWindowId).toMatchObject({ success: true, data: expect.any(String) });
    await expect.poll(() => running?.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);

    const applicationExited = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Saika Director did not exit')), 10_000);
      running?.app.process().once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    await running.app.evaluate(({ BrowserWindow, dialog }) => {
      Object.defineProperty(dialog, 'showMessageBoxSync', { value: () => 0 });
      const window = BrowserWindow.getAllWindows().find((candidate) => candidate.getTitle() === 'Saika Director');
      if (!window) throw new Error('Main window was not found');
      setTimeout(() => window.close(), 0);
    });

    await applicationExited;
  });
});

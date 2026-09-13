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

  test('opens event entries before championship records and keeps event navigation visible', async () => {
    running = await launchDirector();
    const page = await running.app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Competition Control' })).toBeVisible();
    await page.evaluate(async () => {
      const api = window.electronAPI.championship;
      const championship = await api.createChampionship({
        name: 'Venue test',
        date: '2026-09-12',
        venue: 'Main range',
      });
      if (!championship.success || !championship.data) throw new Error('Championship creation failed');
      const event = await api.createEvent({
        championshipId: championship.data,
        name: '10m Air Rifle',
        eventType: 'AR60',
      });
      if (!event.success) throw new Error('Event creation failed');
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.getByRole('button', { name: 'Championships', exact: true }).click();
    await page.getByRole('button', { name: /^Venue test/ }).click();
    await page
      .getByRole('button', { name: /^10m Air Rifle/ })
      .first()
      .click();
    const tabs = page.getByRole('tablist', { name: 'Event workspace' });
    await expect(tabs).toBeInViewport();
    for (const tab of await tabs.getByRole('tab').all()) await expect(tab).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Entry list' })).toBeInViewport();
    const participants = tabs.getByRole('tab', { name: 'Participants', exact: true });
    await participants.focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: 'Firing-Point Assignment' })).toBeFocused();
    await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'event-assignments-tab');
    await page.keyboard.press('Home');
    await expect(participants).toBeFocused();
    await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'event-participants-tab');
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

  test('stores reusable operational settings through the application bridge', async () => {
    running = await launchDirector();
    const page = await running.app.firstWindow();
    const outcome = await page.evaluate(async () => {
      const api = window.electronAPI.operationalTemplates;
      const created = await api.save({
        name: 'External range',
        description: '',
        modes: { relay: 'REQUIRED' },
        expectedRevision: 0,
      });
      if (!created.success) throw new Error(created.error.message);
      const listed = await api.list({});
      const removed = await api.remove({ id: created.data.id, expectedRevision: created.data.revision });
      return { created, listed, removed, after: await api.list({}) };
    });
    expect(outcome.created).toMatchObject({
      success: true,
      data: { name: 'External range', revision: 1, modes: { relay: 'REQUIRED' } },
    });
    expect(outcome.listed).toMatchObject({
      success: true,
      data: [expect.objectContaining({ name: 'External range' })],
    });
    expect(outcome.removed.success).toBe(true);
    expect(outcome.after).toEqual({ success: true, data: [] });
  });

  test('shows application update availability in a development build', async () => {
    running = await launchDirector();
    const page = await running.app.firstWindow();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Updates', exact: true }).click();
    const updates = page.getByRole('region', { name: 'Application updates' });
    await expect(updates.getByText('Auto-update is available only in packaged releases.')).toBeVisible();
    await expect(updates.getByText(/Current version:/)).toBeVisible();
    await expect(updates.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
    await expect(updates.getByRole('button', { name: 'Restart and install' })).toHaveCount(0);
    const state = await page.evaluate(() => window.electronAPI.updater.getUpdateState());
    expect(state).toMatchObject({ success: true, data: { status: 'unsupported', canInstallUpdate: false } });
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
      running?.childProcess.once('exit', () => {
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

  test('keeps examination drafts and saved actions attached to the selected case', async () => {
    running = await launchDirector();
    const page = await running.app.firstWindow();
    const caseIds = await page.evaluate(async () => {
      const api = window.electronAPI.targetExaminations;
      const ids: string[] = [];
      for (const summary of ['First target examination', 'Second target examination']) {
        const response = await api.create({
          scopes: [{ scopeType: 'COMPETITION', scopeId: '11111111-1111-4111-8111-111111111111' }],
          issueKind: 'NO_SHOT_INDICATION',
          occurredAt: new Date().toISOString(),
          summary,
          details: 'Monitor did not show the reported shot.',
          ruleReferences: 'ISSF 6.10.8',
          openedBy: 'RTS Officer',
        });
        if (!response.success) throw new Error(response.error.message);
        ids.push(response.data.id);
      }
      return ids;
    });

    await page.getByRole('button', { name: 'Target Examinations', exact: true }).click();
    await page.getByRole('button', { name: /First target examination/ }).click();
    await page.getByRole('button', { name: 'Record action', exact: true }).click();
    await page.getByLabel('Statement / authorization').fill('Unsubmitted first case note');
    await page.getByRole('button', { name: /Second target examination/ }).click();
    await expect(page.getByLabel('Statement / authorization')).toHaveCount(0);
    await page.getByRole('button', { name: 'Record action', exact: true }).click();
    await expect(page.getByLabel('Statement / authorization')).toHaveValue('');
    await page.getByLabel('Statement / authorization').fill('Second case evidence examined');
    await page.getByLabel('Official name', { exact: true }).fill('RTS Jury');
    await page.getByRole('button', { name: 'Append action', exact: true }).click();
    await expect(page.getByText('Second case evidence examined', { exact: true })).toBeVisible();

    const cases = await page.evaluate(async () => {
      const response = await window.electronAPI.targetExaminations.listAll();
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    });
    expect(cases.find((item) => item.id === caseIds[0])?.entries).toEqual([]);
    expect(cases.find((item) => item.id === caseIds[1])?.entries).toEqual([
      expect.objectContaining({ statement: 'Second case evidence examined', officialName: 'RTS Jury' }),
    ]);
  });
});

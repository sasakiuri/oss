// SPDX-License-Identifier: MIT
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { createVistaServer, requestVista } from '@sasakiuri/saika-protocol/vista-node';

import type { NodeState } from '../src/shared/model';
import { publishedSnapshot, screenConfig, snapshot } from '../tests/fixtures';

test('pairs a source, applies a monitor, renders live targets and restores standby after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vista-e2e-'));
  const identity = {
    protocolVersion: 1 as const,
    sourceId: 'lane-one',
    bootId: 'boot-one',
    kind: 'lane' as const,
    name: 'Lane 1',
  };
  const secret = 'e'.repeat(43);
  let finished = false;
  const server = await createVistaServer({
    identity,
    secret,
    handle: (method, path) => {
      if (method !== 'GET') throw new Error('Read only');
      if (path.endsWith('/catalog'))
        return {
          identity,
          subjects: [
            {
              id: 'session-one',
              label: 'Session 1',
              eventCode: 'AR60',
              competition: null,
              relay: null,
              availability: 'available',
              reason: null,
            },
          ],
        };
      if (path.endsWith('/snapshot/session-one')) return { ...snapshot(finished ? 2 : 1), finished };
      throw new Error('Not found');
    },
  });
  let application: ElectronApplication | undefined;
  const launch = () =>
    electron.launch({
      ...(process.env.VISTA_E2E_EXECUTABLE ? { executablePath: process.env.VISTA_E2E_EXECUTABLE } : {}),
      args: [
        ...(process.env.VISTA_E2E_EXECUTABLE ? [] : [resolve('dist/main/main.js')]),
        `--vista-data-dir=${directory}`,
      ],
    });
  try {
    application = await launch();
    const operator = await application.firstWindow();
    await expect(operator.getByRole('heading', { name: 'Audience screens' })).toBeVisible();
    await operator.screenshot({ path: join('test-results', 'vista-operator-empty.png'), fullPage: true });
    await operator.getByRole('button', { name: 'Data sources' }).click();
    await operator.getByLabel('Endpoint', { exact: true }).fill(`http://127.0.0.1:${server.port}`);
    await operator.getByLabel('Pairing secret', { exact: true }).fill(secret);
    await operator.getByRole('button', { name: 'Connect source', exact: true }).click();
    await expect(operator.getByRole('heading', { name: 'Lane 1' })).toBeVisible();
    // Use the scoped operator bridge for exact monitor assignment, then inspect the real audience process.
    await operator.evaluate(async (config) => {
      const state = await window.vista.getState();
      config.monitorId = state.local.monitors.find((monitor) => monitor.primary)!.id;
      await window.vista.command({ type: 'apply', nodeId: state.local.identity.sourceId, config });
    }, screenConfig());
    await expect.poll(() => application!.windows().length).toBe(2);
    const audience = application.windows().find((window) => window !== operator)!;
    expect(
      await audience.evaluate(async () => {
        try {
          await window.vistaUpdates.check();
          return 'allowed';
        } catch (error) {
          return String(error);
        }
      }),
    ).toContain('requires the local operator window');
    await expect(audience.getByText('\u5c04\u6483 \u592a\u90ce', { exact: true })).toBeVisible();
    await expect
      .poll(() => operator.evaluate(async () => (await window.vista.getState()).local.screens[0]?.renderAlive))
      .toBe(true);
    await expect(audience.locator('svg')).toHaveCount(1);
    await audience.screenshot({ path: join('test-results', 'vista-audience-live.png'), fullPage: true });
    await operator.getByRole('button', { name: /Screens/ }).click();
    await operator.getByRole('button', { name: /North stand/ }).click();
    await operator.getByLabel('Screen name').fill('East stand');
    operator.once('dialog', (dialog) => void dialog.dismiss());
    await operator.getByRole('button', { name: /Data sources/ }).click();
    await expect(operator.getByLabel('Screen name')).toHaveValue('East stand');
    expect(await operator.evaluate(async () => (await window.vista.getState()).local.screens[0]!.config.name)).toBe(
      'North stand',
    );
    const apply = operator.getByRole('button', { name: 'Apply to screen' });
    await expect(apply).toBeInViewport();
    await apply.click();
    await expect(operator.getByText('No changes', { exact: true })).toBeVisible();
    await expect(operator.getByRole('status', { name: 'Display status' })).toContainText('Displaying');
    await operator.getByText('Settings and display confirmation', { exact: true }).click();
    await expect(operator.getByText('Confirmed v2', { exact: true })).toBeVisible();
    await operator.getByText('Settings and display confirmation', { exact: true }).click();
    expect(await operator.evaluate(async () => (await window.vista.getState()).local.screens[0]!.config.name)).toBe(
      'East stand',
    );
    await operator.screenshot({ path: join('test-results', 'vista-operator-editor.png'), fullPage: true });
    await expect(operator.getByLabel('Shot display')).toBeHidden();
    await operator.getByText('Target appearance', { exact: true }).focus();
    await operator.keyboard.press('Enter');
    await expect(operator.getByLabel('Shot display')).toBeVisible();
    await operator.getByLabel('Shot display').selectOption('recent');
    await operator.getByLabel('Recent shot count').fill('6');
    await expect(apply).toBeInViewport();
    await apply.click();
    await operator.getByText('Settings and display confirmation', { exact: true }).click();
    await expect(operator.getByText('Confirmed v3', { exact: true })).toBeVisible();
    await operator.getByText('Settings and display confirmation', { exact: true }).click();
    expect(
      await operator.evaluate(async () => (await window.vista.getState()).local.screens[0]!.config.recentShots),
    ).toBe(6);
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => !new URL(window.webContents.getURL()).searchParams.has('screen'))!
        .setSize(780, 700),
    );
    await operator.getByLabel('Recent shot count').fill('7');
    await expect(apply).toBeInViewport();
    expect(await operator.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await operator.screenshot({ path: join('test-results', 'vista-editor-minimum-scrolled.png') });
    await apply.click();
    await operator.getByText('Settings and display confirmation', { exact: true }).click();
    await expect(operator.getByText('Confirmed v4', { exact: true })).toBeVisible();
    expect(
      await operator.evaluate(async () => (await window.vista.getState()).local.screens[0]!.config.recentShots),
    ).toBe(7);
    await expect(audience.evaluate(() => window.vista.getState())).rejects.toThrow('local operator');
    await operator.evaluate(async () => {
      const state = await window.vista.getState();
      await window.vista.command({
        type: 'apply',
        nodeId: state.local.identity.sourceId,
        config: { ...state.local.screens[0]!.config, revision: 5, standby: true },
      });
    });
    await expect(audience.getByText('Standby', { exact: true }).first()).toBeVisible();
    finished = true;
    await expect
      .poll(() => operator.evaluate(async () => (await window.vista.getState()).snapshots[0]?.snapshot.finished))
      .toBe(true);
    await application.close();
    application = undefined;
    await server.close();
    const savedFile = join(directory, 'vista.json');
    const saved = JSON.parse(await readFile(savedFile, 'utf8'));
    const invalid = snapshot();
    invalid.subjectId = 'damaged-session';
    invalid.participants[0]!.currentStage = 99;
    const invalidEntry = { snapshot: invalid, state: 'saved', receivedAt: Date.now(), error: null };
    saved.snapshots.push(invalidEntry);
    await writeFile(savedFile, JSON.stringify(saved));
    application = await launch();
    await expect.poll(() => application!.windows().length).toBe(1);
    const restored = application.windows().find((window) => new URL(window.url()).searchParams.has('screen'))!;
    await expect(restored.getByText('Standby', { exact: true }).first()).toBeVisible();
    // Explicitly reopening the application reveals the operator when the primary
    // monitor is already reserved for an automatically restored audience screen.
    await application.evaluate(({ app }) => app.emit('second-instance', {}, [], ''));
    await expect.poll(() => application!.windows().length).toBe(2);
    const restoredOperator = application.windows().find((window) => window !== restored)!;
    await expect(restoredOperator.getByRole('alert')).toContainText('lane-one / damaged-session');
    await restoredOperator.evaluate(async () => {
      const state = await window.vista.getState();
      await window.vista.command({
        type: 'apply',
        nodeId: state.local.identity.sourceId,
        config: { ...state.local.screens[0]!.config, revision: 6, standby: false },
      });
    });
    await expect(restored.getByText('\u5c04\u6483 \u592a\u90ce', { exact: true })).toBeVisible();
    await expect(restored.getByText(/Saved display|Updates paused/).first()).toBeVisible();
    expect(JSON.parse(await readFile(savedFile, 'utf8')).snapshots).toContainEqual(invalidEntry);
    await application.evaluate(({ BrowserWindow }) => {
      const output = BrowserWindow.getAllWindows().find((window) =>
        new URL(window.webContents.getURL()).searchParams.has('screen'),
      )!;
      output.webContents.forcefullyCrashRenderer();
    });
    await expect
      .poll(() => restoredOperator.evaluate(async () => (await window.vista.getState()).local.screens[0]?.renderAlive))
      .toBe(false);
    await restoredOperator.evaluate(() => window.vista.command({ type: 'openScreen', screenId: 'screen-one' }));
    await expect
      .poll(() => restoredOperator.evaluate(async () => (await window.vista.getState()).local.screens[0]?.renderAlive))
      .toBe(true);
    // Playwright's old Page is permanently marked crashed. Inspect the replacement renderer through Electron.
    expect(
      await application.evaluate(async ({ BrowserWindow }) => {
        const output = BrowserWindow.getAllWindows().find((window) =>
          new URL(window.webContents.getURL()).searchParams.has('screen'),
        )!;
        return {
          crashed: output.webContents.isCrashed(),
          name: await output.webContents.executeJavaScript(
            "document.querySelector('.athlete-heading h2')?.textContent",
          ),
        };
      }),
    ).toEqual({ crashed: false, name: '\u5c04\u6483 \u592a\u90ce' });
  } finally {
    await application?.close();
    await server.close().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});

test('keeps a managed display connected after removing its last restored audience screen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vista-managed-e2e-'));
  let application: ElectronApplication | undefined;
  let electronProcess: ReturnType<ElectronApplication['process']> | undefined;
  const launch = () =>
    electron.launch({
      ...(process.env.VISTA_E2E_EXECUTABLE ? { executablePath: process.env.VISTA_E2E_EXECUTABLE } : {}),
      args: [
        ...(process.env.VISTA_E2E_EXECUTABLE ? [] : [resolve('dist/main/main.js')]),
        `--vista-data-dir=${directory}`,
      ],
    });
  try {
    application = await launch();
    electronProcess = application.process();
    const operator = await application.firstWindow();
    await expect(operator.getByRole('heading', { name: 'Audience screens' })).toBeVisible();
    const initial = await operator.evaluate(() => window.vista.getState());
    const config = {
      ...screenConfig(),
      monitorId: initial.local.monitors.find((monitor) => monitor.primary)!.id,
      selections: [],
      standby: true,
    };
    await operator.evaluate((command) => window.vista.command(command), {
      type: 'apply' as const,
      nodeId: initial.local.identity.sourceId,
      config,
    });
    await application.close();
    application = undefined;
    application = await launch();
    electronProcess = application.process();
    await expect.poll(() => application!.windows().length).toBe(1);
    await expect(application.windows()[0]!.getByText('Standby', { exact: true }).first()).toBeVisible();
    const saved = JSON.parse(await readFile(join(directory, 'vista.json'), 'utf8'));
    const endpoint = `http://127.0.0.1:${saved.port}`;
    const owner = { controllerId: 'operator-pc', controllerGeneration: 1 };
    const request = (method: 'GET' | 'POST', path: string, body?: unknown) =>
      requestVista<NodeState>(
        endpoint,
        initial.pairingSecret,
        method,
        `/vista/v1/display/${path}`,
        body,
        initial.local.identity.sourceId,
      );
    await request('POST', 'register', owner);
    await request('POST', 'remove', { ...owner, screenId: config.id });
    await expect.poll(() => application!.windows().length).toBe(0);
    expect((await request('GET', 'state')).screens).toEqual([]);
    await request('POST', 'apply', { ...owner, config: { ...config, revision: 2 } });
    await expect.poll(() => application!.windows().length).toBe(1);
    await expect(application.windows()[0]!.getByText('Standby', { exact: true }).first()).toBeVisible();
    expect((await request('GET', 'state')).screens[0]!.appliedRevision).toBe(2);
  } finally {
    if (electronProcess?.exitCode === null) await application?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('keeps every configured ranking row inside the audience screen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vista-ranking-e2e-'));
  const identity = {
    protocolVersion: 1 as const,
    sourceId: 'lane-one',
    bootId: 'boot-one',
    kind: 'director' as const,
    name: 'Director',
  };
  const secret = 'r'.repeat(43);
  const server = await createVistaServer({
    identity,
    secret,
    handle: (_method, path) => {
      if (path.endsWith('/catalog'))
        return {
          identity,
          subjects: [
            {
              id: 'session-one',
              label: 'Competition',
              eventCode: 'AR60',
              competition: null,
              relay: null,
              availability: 'available',
              reason: null,
            },
          ],
        };
      if (path.endsWith('/snapshot/session-one'))
        return {
          ...snapshot(),
          ranking: {
            scope: 'Competition',
            kind: 'competition',
            revision: '1',
            state: 'OFFICIAL',
            rows: Array.from({ length: 101 }, (_, index) => ({
              id: `athlete-${index}`,
              rank: index + 1,
              name: `Athlete ${index + 1}`,
              affiliation: null,
              total: 200 - index,
              classification: null,
            })),
          },
        };
      throw new Error('Not found');
    },
  });
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({
      ...(process.env.VISTA_E2E_EXECUTABLE ? { executablePath: process.env.VISTA_E2E_EXECUTABLE } : {}),
      args: [
        ...(process.env.VISTA_E2E_EXECUTABLE ? [] : [resolve('dist/main/main.js')]),
        `--vista-data-dir=${directory}`,
      ],
    });
    const operator = await application.firstWindow();
    await expect(operator.getByRole('heading', { name: 'Audience screens' })).toBeVisible();
    await operator.evaluate(
      ({ endpoint, secret }) => window.vista.command({ type: 'connectSource', endpoint, secret }),
      { endpoint: `http://127.0.0.1:${server.port}`, secret },
    );
    let fullPageFont = '';
    for (const [index, { slots, page, count }] of [
      { slots: 20, page: 0, count: 20 },
      { slots: 20, page: 5, count: 1 },
      { slots: 1, page: 0, count: 1 },
      { slots: 100, page: 0, count: 100 },
    ].entries()) {
      await operator.evaluate(
        async (config) => {
          const state = await window.vista.getState();
          config.monitorId = state.local.monitors[0]!.id;
          await window.vista.command({ type: 'apply', nodeId: state.local.identity.sourceId, config });
        },
        { ...screenConfig(index + 1), view: 'ranking' as const, autoRotate: false, slots, page },
      );
      await expect.poll(() => application!.windows().length).toBe(2);
      const audience = application.windows().find((window) => window !== operator)!;
      await audience.setViewportSize({ width: 1920, height: 1080 });
      await expect(audience.locator('tbody tr')).toHaveCount(count);
      await expect(audience.locator('.page-indicator')).toHaveText(`Page ${page + 1} / ${Math.ceil(101 / slots)}`);
      const bounds = await audience.evaluate(() => {
        const table = document.querySelector('.ranking-table')!;
        return {
          bottom: table.getBoundingClientRect().bottom,
          availableBottom: document.querySelector('.ranking-table-space')!.getBoundingClientRect().bottom,
          footerTop: document.querySelector('.audience-footer')!.getBoundingClientRect().top,
          font: getComputedStyle(table).fontSize,
        };
      });
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.availableBottom + 1);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.footerTop);
      if (index === 0) fullPageFont = bounds.font;
      if (index === 1) expect(bounds.font).toBe(fullPageFont);
      if (slots === 1) expect(Number.parseFloat(bounds.font)).toBeLessThanOrEqual(50);
    }
  } finally {
    await application?.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('displays complete Final result rows through paging, publication changes, reconnect and offline restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vista-final-results-e2e-'));
  const identity = {
    protocolVersion: 1 as const,
    sourceId: 'lane-one',
    bootId: 'boot-one',
    kind: 'director' as const,
    name: 'Director',
  };
  const secret = 'f'.repeat(43);
  let current = publishedSnapshot();
  let online = true;
  const server = await createVistaServer({
    identity,
    secret,
    handle: (_method, path) => {
      if (!online) throw new Error('Source unavailable');
      if (path.endsWith('/catalog'))
        return {
          identity,
          subjects: [
            {
              id: current.subjectId,
              label: current.label,
              eventCode: 'AR60',
              competition: null,
              relay: null,
              availability: 'available',
              reason: null,
            },
          ],
        };
      if (path.endsWith('/snapshot/session-one')) return { ...current, capturedAt: Date.now() };
      throw new Error('Not found');
    },
  });
  let application: ElectronApplication | undefined;
  const launch = () =>
    electron.launch({
      ...(process.env.VISTA_E2E_EXECUTABLE ? { executablePath: process.env.VISTA_E2E_EXECUTABLE } : {}),
      args: [
        ...(process.env.VISTA_E2E_EXECUTABLE ? [] : [resolve('dist/main/main.js')]),
        `--vista-data-dir=${directory}`,
      ],
    });
  try {
    application = await launch();
    const operator = await application.firstWindow();
    await expect(operator.getByRole('heading', { name: 'Audience screens' })).toBeVisible();
    await operator.evaluate(
      ({ endpoint, secret }) => window.vista.command({ type: 'connectSource', endpoint, secret }),
      { endpoint: `http://127.0.0.1:${server.port}`, secret },
    );
    const config = { ...screenConfig(), view: 'final' as const, autoRotate: false, slots: 1 };
    config.selections[0]!.participantIds = ['lane-one'];
    await operator.evaluate(async (config) => {
      const state = await window.vista.getState();
      config.monitorId = state.local.monitors.find((monitor) => monitor.primary)!.id;
      await window.vista.command({ type: 'apply', nodeId: state.local.identity.sourceId, config });
    }, config);
    await expect.poll(() => application!.windows().length).toBe(2);
    const audience = application.windows().find((window) => window !== operator)!;
    await expect(audience.locator('tbody tr')).toHaveCount(1);
    await expect(audience.locator('tbody')).toContainText('Earlier relay winner');
    await expect(audience.locator('.ranking-score')).toHaveText('600.0');
    await expect(audience.locator('.publication')).toHaveText('Competition ranking · Official');
    await expect(audience.locator('.page-indicator')).toHaveText('Page 1 / 2');
    await expect(audience.locator('svg')).toHaveCount(0);
    await expect(audience.getByText('Current run athlete')).toHaveCount(0);
    await operator.evaluate(async () => {
      const state = await window.vista.getState();
      await window.vista.command({
        type: 'apply',
        nodeId: state.local.identity.sourceId,
        config: { ...state.local.screens[0]!.config, revision: 2, page: 1 },
      });
    });
    await expect(audience.locator('tbody')).toContainText('Published athlete');
    await expect(audience.locator('.ranking-score')).toHaveText('590.0');
    await expect(audience.locator('.rank-number')).toHaveText('2');
    await expect(audience.locator('tbody')).toContainText('RPO');
    await expect(audience.locator('.page-indicator')).toHaveText('Page 2 / 2');
    current = { ...current, revision: 2, ranking: { ...current.ranking!, state: 'REVIEW_REQUIRED' } };
    await expect(audience.locator('.publication')).toHaveText('Competition ranking · Review required');
    await expect(audience.locator('.ranking-score')).toHaveText('590.0');
    online = false;
    await expect(audience.locator('.publication')).toContainText('publication unconfirmed');
    await expect(audience.locator('.ranking-score')).toHaveText('590.0');
    current = { ...current, revision: 3, ranking: { ...current.ranking!, state: 'OFFICIAL' } };
    online = true;
    await expect(audience.locator('.publication')).toHaveText('Competition ranking · Official');
    await expect(audience.locator('.ranking-score')).toHaveText('590.0');
    await application.close();
    application = undefined;
    online = false;
    application = await launch();
    const restored = await application.firstWindow();
    await expect(restored.locator('.ranking-score')).toHaveText('590.0');
    await expect(restored.locator('.page-indicator')).toHaveText('Page 2 / 2');
    await expect(restored.locator('.publication')).toContainText('publication unconfirmed');
    await expect(restored.locator('.publication')).not.toContainText('Official');
    await expect(restored.locator('svg')).toHaveCount(0);
  } finally {
    await application?.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('keeps targets and card details visible at every configured grid density', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vista-target-grid-e2e-'));
  const identity = {
    protocolVersion: 1 as const,
    sourceId: 'lane-one',
    bootId: 'boot-one',
    kind: 'director' as const,
    name: 'Director',
  };
  const secret = 'g'.repeat(43);
  const frame = snapshot();
  const participant = frame.participants[0]!;
  frame.participants = Array.from({ length: 101 }, (_, index) => {
    const mode = (['match', 'sighting', 'shoot-off'] as const)[index % 3]!;
    return {
      ...participant,
      id: `athlete-${index + 1}`,
      laneId: `lane-${index + 1}`,
      laneName: `Lane ${index + 1}`,
      name: `Athlete ${index + 1} · \u5c04\u6483 \u592a\u90ce · Long athlete name`,
      affiliation: 'International Rifle and Pistol Club',
      mode,
      total: 102,
      shotCount: 10,
      shots: Array.from({ length: 10 }, (_, shotIndex) => ({
        ...participant.shots[0]!,
        id: `shot-${index}-${shotIndex}`,
        sequence: shotIndex + 1,
        mode,
        corrected: shotIndex === 9,
        recorded: mode !== 'sighting',
      })),
      clock: {
        generation: 'clock-one',
        revision: 1,
        label: 'Competition timer',
        state: 'running' as const,
        sampledAt: frame.capturedAt,
        remainingMs: 600_000,
      },
    };
  });
  frame.ranking = {
    scope: 'Competition',
    kind: 'live',
    revision: '1',
    state: 'DRAFT',
    rows: frame.participants.map((entry, index) => ({
      id: entry.id,
      rank: index + 1,
      name: entry.name!,
      affiliation: entry.affiliation,
      total: entry.total!,
      classification: null,
    })),
  };
  const server = await createVistaServer({
    identity,
    secret,
    handle: (_method, path) => {
      if (path.endsWith('/catalog'))
        return {
          identity,
          subjects: [
            {
              id: frame.subjectId,
              label: 'Competition',
              eventCode: 'AR60',
              competition: null,
              relay: null,
              availability: 'available',
              reason: null,
            },
          ],
        };
      if (path.endsWith('/snapshot/session-one')) return { ...frame, capturedAt: Date.now() };
      throw new Error('Not found');
    },
  });
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({
      ...(process.env.VISTA_E2E_EXECUTABLE ? { executablePath: process.env.VISTA_E2E_EXECUTABLE } : {}),
      args: [
        ...(process.env.VISTA_E2E_EXECUTABLE ? [] : [resolve('dist/main/main.js')]),
        `--vista-data-dir=${directory}`,
      ],
    });
    const operator = await application.firstWindow();
    await expect(operator.getByRole('heading', { name: 'Audience screens' })).toBeVisible();
    await operator.evaluate(
      ({ endpoint, secret }) => window.vista.command({ type: 'connectSource', endpoint, secret }),
      { endpoint: `http://127.0.0.1:${server.port}`, secret },
    );
    let fullPageHeight = 0;
    for (const [index, { view, slots, page, count }] of (
      [
        { view: 'targets', slots: 4, page: 0, count: 4 },
        { view: 'targets', slots: 9, page: 0, count: 9 },
        { view: 'targets', slots: 16, page: 0, count: 16 },
        { view: 'targets', slots: 16, page: 6, count: 5 },
        { view: 'targets', slots: 25, page: 0, count: 25 },
        { view: 'targets', slots: 100, page: 0, count: 100 },
        { view: 'focus', slots: 16, page: 0, count: 1 },
        { view: 'final', slots: 16, page: 6, count: 5 },
      ] as const
    ).entries()) {
      await operator.evaluate(
        async (config) => {
          const state = await window.vista.getState();
          config.monitorId = state.local.monitors[0]!.id;
          await window.vista.command({ type: 'apply', nodeId: state.local.identity.sourceId, config });
        },
        { ...screenConfig(index + 1), view, autoRotate: false, slots, page },
      );
      await expect.poll(() => application!.windows().length).toBe(2);
      const audience = application.windows().find((window) => window !== operator)!;
      await audience.setViewportSize({ width: 1920, height: 1080 });
      await expect(audience.locator('.athlete-card')).toHaveCount(count);
      const bounds = await audience.evaluate(() => {
        const footerTop = document.querySelector('.audience-footer')!.getBoundingClientRect().top;
        return [...document.querySelectorAll('.athlete-card')].map((card) => {
          const rect = card.getBoundingClientRect();
          const target = card.querySelector('svg')!.getBoundingClientRect();
          const targetSpace = card.querySelector('.athlete-target')!.getBoundingClientRect();
          const shotSummary = card.querySelector('.shot-summary')!.getBoundingClientRect();
          const details = [
            '.athlete-heading h2',
            '.mode-label',
            '.athlete-total > strong',
            '.shot-summary',
            '.series-details',
            '.shot-strip',
            '.athlete-footer',
          ].map((selector) => card.querySelector(selector)!.getBoundingClientRect());
          return {
            targetWidth: target.width,
            targetHeight: target.height,
            height: rect.height,
            fits: card.scrollHeight <= card.clientHeight + 1 && rect.bottom <= footerTop + 1,
            summaryFitsTargetSpace: shotSummary.top >= targetSpace.top && shotSummary.bottom <= targetSpace.bottom + 1,
            detailsFit: [target, ...details].every(
              (child) =>
                child.width > 0 &&
                child.height > 0 &&
                child.top >= rect.top &&
                child.left >= rect.left &&
                child.bottom <= rect.bottom + 1 &&
                child.right <= rect.right + 1,
            ),
          };
        });
      });
      for (const card of bounds) {
        expect(card.targetWidth, `${view} ${slots} targets: target width`).toBeGreaterThan(0);
        expect(card.targetHeight, `${view} ${slots} targets: target height`).toBeGreaterThan(0);
        expect(card.fits, `${view} ${slots} targets: card fits the screen`).toBe(true);
        expect(card.summaryFitsTargetSpace, `${view} ${slots} targets: score and clock fit beside the target`).toBe(
          true,
        );
        expect(card.detailsFit, `${view} ${slots} targets: target and details fit the card`).toBe(true);
      }
      if (view === 'targets' && slots === 16 && page === 0) fullPageHeight = bounds[0]!.height;
      if (view === 'targets' && slots === 16 && page === 6) expect(bounds[0]!.height).toBeCloseTo(fullPageHeight, 1);
    }
  } finally {
    await application?.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

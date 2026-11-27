// SPDX-License-Identifier: MIT
import { afterEach, expect, it, vi } from 'vitest';

import type { DesktopPort } from '../src/main/DesktopPort';

import {
  afterTest,
  cleanUp,
  desktopPort,
  internals,
  pausePolling,
  secret,
  sourceServer,
  startApplication,
} from './applicationFixtures';
import { monitor, screenConfig, snapshot } from './fixtures';

vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => '/opt/saika-vista' } }));

afterEach(async () => {
  vi.useRealTimers();
  await cleanUp();
});

async function start(port: DesktopPort) {
  const app = await startApplication('vista-notify-', port);
  const scheduled = await pausePolling(app);
  /** One poll round without rescheduling the next; the polls it starts keep running. */
  const tick = async () => {
    await scheduled.tick();
    if (scheduled.timer) clearTimeout(scheduled.timer);
  };
  /** One poll round, after the polls it started have stored their results. */
  const poll = async () => {
    await tick();
    await Promise.allSettled([...scheduled.activeTasks]);
    await app.state.flush();
  };
  return { app, tick, poll };
}

/** A Vista PC that shows one live Lane subject and polls only when a test asks it to. */
async function liveScreen() {
  // Time stands still unless a test moves it, so freshness stays within one second.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Math.floor(Date.now() / 1000) * 1000 + 100);
  const source = { revision: 1, hold: Promise.resolve() };
  const renderer = { revision: null as number | null, alive: false };
  const monitors = [monitor()];
  const changed = vi.fn();
  const server = await sourceServer({
    secret,
    current: async () => {
      await source.hold;
      return snapshot(source.revision);
    },
  });
  afterTest(() => server.close().catch(() => undefined));
  const vista = await start(desktopPort({ changed, monitors: () => monitors, status: () => renderer }));
  await vista.app.command({ type: 'connectSource', endpoint: `http://127.0.0.1:${server.port}`, secret });
  await vista.app.command({ type: 'apply', nodeId: vista.app.identity.sourceId, config: screenConfig() });
  await vista.poll();
  expect(vista.app.view().snapshots[0]?.state).toBe('live');
  await vista.poll();
  changed.mockClear();
  return { ...vista, changed, server, source, renderer, monitors };
}

it('does not notify the renderers for an idle poll round', async () => {
  const changed = vi.fn();
  const { tick } = await start(desktopPort({ changed }));
  await tick();
  changed.mockClear();

  await tick();
  await tick();

  expect(changed).not.toHaveBeenCalled();
});

it('notifies the renderers of a freshness-only update once its receipt time reaches a new second', async () => {
  const { app, changed, poll } = await liveScreen();
  const before = app.view().snapshots[0]!.receivedAt;

  vi.setSystemTime(before + 300);
  await poll();
  vi.setSystemTime(before + 600);
  await poll();

  expect(app.view().snapshots[0]!.receivedAt).toBe(before + 600);
  expect(changed).not.toHaveBeenCalled();

  vi.setSystemTime(before + 900);
  await poll();

  expect(app.view().snapshots[0]!.receivedAt).toBe(before + 900);
  expect(changed).toHaveBeenCalledOnce();
});

it('keeps polling when a notification fails', async () => {
  let fail = false;
  const { app, tick } = await start(
    desktopPort({
      monitors: () => {
        if (fail) throw new Error('Displays are unavailable');
        return [monitor()];
      },
    }),
  );
  await tick();
  const scheduled = internals(app);

  const previous = scheduled.timer;

  fail = true;
  await expect(scheduled.tick()).resolves.toBeUndefined();
  fail = false;

  expect(scheduled.timer).not.toBe(previous);
  clearTimeout(scheduled.timer!);
  expect(app.view().error).toBe('Displays are unavailable');
});

const changes: ReadonlyArray<readonly [string, (screen: Awaited<ReturnType<typeof liveScreen>>) => Promise<unknown>]> =
  [
    ['a source publishes a new revision', async ({ source, poll }) => ((source.revision = 2), poll())],
    ['a source goes offline', async ({ server, poll }) => (await server.close(), poll())],
    [
      'an audience window confirms its rendering',
      async ({ renderer, poll }) => ((renderer.revision = 1), (renderer.alive = true), poll()),
    ],
    [
      'a monitor is connected',
      async ({ monitors, poll }) => (monitors.push({ ...monitor(), id: 'monitor-two', primary: false }), poll()),
    ],
    [
      'the operator applies a screen',
      async ({ app }) =>
        app.command({ type: 'apply', nodeId: app.identity.sourceId, config: { ...screenConfig(2), name: 'South' } }),
    ],
    [
      'the operator identifies a screen',
      async ({ app }) => app.command({ type: 'identify', nodeId: app.identity.sourceId, screenId: 'screen-one' }),
    ],
  ];

it.each(changes)('notifies the renderers when %s, then stays quiet', async (_change, change) => {
  const screen = await liveScreen();

  await change(screen);
  await screen.poll();

  expect(screen.changed).toHaveBeenCalled();
  screen.changed.mockClear();
  await screen.poll();
  expect(screen.changed).not.toHaveBeenCalled();
});

it('notifies the renderers when a snapshot turns stale because its updates stopped', async () => {
  const { app, changed, source, tick } = await liveScreen();
  let release!: () => void;
  source.hold = new Promise((resolve) => {
    release = resolve;
  });
  afterTest(async () => release());

  vi.setSystemTime(Date.now() + 4001);
  await tick();

  expect(app.view().snapshots[0]).toMatchObject({ state: 'stale', error: 'Updates have stopped' });
  expect(changed).toHaveBeenCalledOnce();
  changed.mockClear();
  await tick();
  expect(changed).not.toHaveBeenCalled();
});

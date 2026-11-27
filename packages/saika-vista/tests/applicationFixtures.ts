// SPDX-License-Identifier: MIT
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { VistaIdentity, VistaSnapshot } from '@sasakiuri/saika-protocol/Vista';
import { createVistaServer, type VistaServer } from '@sasakiuri/saika-protocol/vista-node';
import { vi } from 'vitest';

import type { DesktopPort } from '../src/main/DesktopPort';
import { VistaApplication } from '../src/main/VistaApplication';

import { monitor, snapshot } from './fixtures';

// Main-process fakes depend on the Vitest runner, so they stay out of the fixtures shared with Playwright.

/** The pairing secret of the sources and display PCs that tests start. */
export const secret = 'a'.repeat(43);

const cleanups: Array<() => Promise<unknown>> = [];

/** Registers a step that cleanUp() runs after the current test, in reverse order of registration. */
export function afterTest(step: () => Promise<unknown>): void {
  cleanups.push(step);
}

/** Runs the registered steps. Test files call it from afterEach. */
export async function cleanUp(): Promise<void> {
  for (const clean of cleanups.reverse()) await clean();
  cleanups.length = 0;
}

/** A new temporary directory that is removed after the test. */
export async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  afterTest(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

/** Starts Vista in a new temporary directory and stops it after the test. */
export async function startApplication(prefix: string, port: DesktopPort = desktopPort()): Promise<VistaApplication> {
  const app = await VistaApplication.start(await temporaryDirectory(prefix), port);
  afterTest(() => app.stop());
  return app;
}

/** A desktop with one connected primary monitor and no rendered audience windows. */
export function desktopPort(overrides: Partial<DesktopPort> = {}): DesktopPort {
  return {
    monitors: () => [monitor()],
    open: vi.fn(),
    close: vi.fn(),
    status: () => ({ revision: null, alive: false }),
    loginStart: async () => undefined,
    changed: vi.fn(),
    ...overrides,
  };
}

/** A read-only Lane or Director source that serves a catalog and one snapshot per listed subject. */
export function sourceServer({
  secret,
  kind = 'lane',
  identity = { protocolVersion: 1, sourceId: 'lane-one', bootId: 'boot-one', kind, name: 'Lane 1' },
  subjects = ['session-one'],
  current = async () => snapshot(),
  port,
}: {
  secret: string;
  kind?: 'lane' | 'director';
  identity?: VistaIdentity;
  /** Read on every request, so a test can change the advertised subjects. */
  subjects?: string[];
  current?: (subjectId: string) => VistaSnapshot | Promise<VistaSnapshot>;
  port?: number;
}): Promise<VistaServer> {
  return createVistaServer({
    identity,
    secret,
    port,
    handle: (method, path) => {
      if (method !== 'GET') throw new Error('Read only');
      if (path.endsWith('/catalog'))
        return {
          identity,
          subjects: subjects.map((id) => ({
            id,
            label: 'Session 1',
            eventCode: 'AR60',
            competition: null,
            relay: null,
            availability: 'available',
            reason: null,
          })),
        };
      const subjectId = subjects.find((id) => path.endsWith(`/snapshot/${id}`));
      if (subjectId) return current(subjectId);
      throw new Error('Not found');
    },
  });
}

/** Private scheduling members that tests drive directly instead of waiting for the 200 ms poll. */
export interface ApplicationInternals {
  timer: ReturnType<typeof setTimeout> | null;
  activeTasks: Set<Promise<void>>;
  tick(): Promise<void>;
  peers: { sync(id: string): Promise<void> };
  display: { handle(method: string, path: string, body: unknown): Promise<unknown> };
  sources: { views: Map<string, unknown>; lastCatalog: Map<string, number> };
}

export function internals(app: VistaApplication): ApplicationInternals {
  return app as unknown as ApplicationInternals;
}

/** Cancels the next scheduled poll and waits for the polls already running. */
export async function pausePolling(app: VistaApplication): Promise<ApplicationInternals> {
  const scheduled = internals(app);
  if (scheduled.timer) clearTimeout(scheduled.timer);
  await Promise.allSettled([...scheduled.activeTasks]);
  return scheduled;
}

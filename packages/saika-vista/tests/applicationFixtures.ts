// SPDX-License-Identifier: MIT
import type { VistaIdentity, VistaSnapshot } from '@sasakiuri/saika-protocol/Vista';
import { createVistaServer, type VistaServer } from '@sasakiuri/saika-protocol/vista-node';
import { vi } from 'vitest';

import type { DesktopPort, VistaApplication } from '../src/main/VistaApplication';

import { monitor, snapshot } from './fixtures';

// Main-process fakes depend on the Vitest runner, so they stay out of the fixtures shared with Playwright.

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
  syncPeer(id: string): Promise<void>;
  handleRemote(method: string, path: string, body: unknown): Promise<unknown>;
  sourceViews: Map<string, unknown>;
  lastCatalog: Map<string, number>;
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

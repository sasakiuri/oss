// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { Mode } from '@/main/modules/session/domain/Mode';
import { vistaModule } from '@/main/modules/vista/vista.module';

import { createMockEventBus } from '../../../../helpers/mockDependencies';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@sasakiuri/saika-protocol/vista-node', () => ({
  loadVistaCredentials: () => ({ sourceId: 'lane-1', secret: 'test-secret' }),
}));
vi.mock('@/main/modules/vista/infra/LaneVistaShotContextReader', () => ({ LaneVistaShotContextReader: class {} }));
vi.mock('@/main/modules/vista/infra/LaneVistaSource', () => ({
  LaneVistaSource: class {
    refresh = refresh;
    getError = () => null;
  },
}));

describe('vista module target mode refresh', () => {
  it('refreshes the competition on a selection even without a clock tick and unsubscribes on close', () => {
    const events = createMockEventBus();
    const closed = vi.fn();
    vistaModule.register({
      userDataPath: '/unused',
      storage: { get: vi.fn() },
      eventBus: events,
      mainWindow: { once: closed },
      ipcRouter: { register: vi.fn() },
    } as unknown as Parameters<typeof vistaModule.register>[0]);
    refresh.mockClear();
    const event = {
      type: 'AthleteTargetModeChanged' as const,
      aggregateId: 'comp-1',
      timestamp: Date.now(),
      newMode: Mode.sighting(),
    };
    events.emit(event);
    expect(refresh).toHaveBeenCalledExactlyOnceWith('comp-1');
    closed.mock.calls[0]![1]();
    refresh.mockClear();
    events.emit(event);
    expect(refresh).not.toHaveBeenCalled();
  });
});

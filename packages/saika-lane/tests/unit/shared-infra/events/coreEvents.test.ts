// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { Discipline } from '@/main/modules/session/domain/Discipline';
import type { Mode } from '@/main/modules/session/domain/Mode';
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
// Import coreEvents to enable the declare module side-effect (EventRegistry augmentation)
import '@/main/shared-infra/events/coreEvents';
import type {
  ConnectionEstablishedEvent,
  ConnectionLostEvent,
  ModeSwitchedEvent,
  SessionResetEvent,
  SessionStartedEvent,
  ShotRecordedEvent,
} from '@/main/shared-infra/events/coreEvents';
import type { AnyDomainEvent, DomainEvent, EventMap, EventName } from '@/main/shared-infra/events/EventBus';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';

// ---------- Logger mock ----------

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------- Mock objects for tests ----------

const mockDiscipline = {} as Discipline;
const mockShot = {} as Shot;
const mockPreviousMode = {} as Mode;
const mockNewMode = {} as Mode;
const mockManufacturer = {} as TargetManufacturer;

// ---------- Event factories for tests ----------

function createSessionStartedEvent(): SessionStartedEvent {
  return {
    type: 'SessionStarted',
    timestamp: Date.now(),
    aggregateId: 'session-1',
    discipline: mockDiscipline,
  };
}

function createShotRecordedEvent(): ShotRecordedEvent {
  return {
    type: 'ShotRecorded',
    timestamp: Date.now(),
    aggregateId: 'session-1',
    shot: mockShot,
    scoringMode: 'DECIMAL',
  };
}

function createModeSwitchedEvent(): ModeSwitchedEvent {
  return {
    type: 'ModeSwitched',
    timestamp: Date.now(),
    aggregateId: 'session-1',
    previousMode: mockPreviousMode,
    newMode: mockNewMode,
  };
}

function createSessionResetEvent(): SessionResetEvent {
  return {
    type: 'SessionReset',
    timestamp: Date.now(),
    aggregateId: 'session-1',
  };
}

function createConnectionEstablishedEvent(): ConnectionEstablishedEvent {
  return {
    type: 'ConnectionEstablished',
    timestamp: Date.now(),
    aggregateId: 'connection-1',
    manufacturer: mockManufacturer,
    portPath: '/dev/ttyUSB0',
    deviceId: null,
  };
}

function createConnectionLostEvent(): ConnectionLostEvent {
  return {
    type: 'ConnectionLost',
    timestamp: Date.now(),
    aggregateId: 'connection-1',
    reason: 'Device unplugged',
  };
}

// ---------- Tests ----------

describe('coreEvents', () => {
  // ============================
  // Type inference tests (expectTypeOf)
  // ============================
  describe('type inference', () => {
    it('SessionStartedEvent has the correct type shape', () => {
      expectTypeOf<SessionStartedEvent>().toMatchTypeOf<DomainEvent>();
      expectTypeOf<SessionStartedEvent>().toHaveProperty('type');
      expectTypeOf<SessionStartedEvent>().toHaveProperty('discipline');
      expectTypeOf<SessionStartedEvent['type']>().toEqualTypeOf<'SessionStarted'>();
    });

    it('ShotRecordedEvent has the correct type shape', () => {
      expectTypeOf<ShotRecordedEvent>().toMatchTypeOf<DomainEvent>();
      expectTypeOf<ShotRecordedEvent>().toHaveProperty('type');
      expectTypeOf<ShotRecordedEvent>().toHaveProperty('shot');
      expectTypeOf<ShotRecordedEvent['type']>().toEqualTypeOf<'ShotRecorded'>();
    });

    it('ModeSwitchedEvent has the correct type shape', () => {
      expectTypeOf<ModeSwitchedEvent>().toMatchTypeOf<DomainEvent>();
      expectTypeOf<ModeSwitchedEvent>().toHaveProperty('previousMode');
      expectTypeOf<ModeSwitchedEvent>().toHaveProperty('newMode');
      expectTypeOf<ModeSwitchedEvent['type']>().toEqualTypeOf<'ModeSwitched'>();
    });

    it('SessionResetEvent has the correct type shape', () => {
      expectTypeOf<SessionResetEvent>().toMatchTypeOf<DomainEvent>();
      expectTypeOf<SessionResetEvent['type']>().toEqualTypeOf<'SessionReset'>();
    });

    it('ConnectionEstablishedEvent has the correct type shape', () => {
      expectTypeOf<ConnectionEstablishedEvent>().toMatchTypeOf<DomainEvent>();
      expectTypeOf<ConnectionEstablishedEvent>().toHaveProperty('manufacturer');
      expectTypeOf<ConnectionEstablishedEvent>().toHaveProperty('portPath');
      expectTypeOf<ConnectionEstablishedEvent['type']>().toEqualTypeOf<'ConnectionEstablished'>();
    });

    it('ConnectionLostEvent has the correct type shape', () => {
      expectTypeOf<ConnectionLostEvent>().toMatchTypeOf<DomainEvent>();
      expectTypeOf<ConnectionLostEvent>().toHaveProperty('reason');
      expectTypeOf<ConnectionLostEvent['type']>().toEqualTypeOf<'ConnectionLost'>();
    });

    it('EventMap correctly maps all 6 event types', () => {
      expectTypeOf<EventMap['SessionStarted']>().toEqualTypeOf<SessionStartedEvent>();
      expectTypeOf<EventMap['ShotRecorded']>().toEqualTypeOf<ShotRecordedEvent>();
      expectTypeOf<EventMap['ModeSwitched']>().toEqualTypeOf<ModeSwitchedEvent>();
      expectTypeOf<EventMap['SessionReset']>().toEqualTypeOf<SessionResetEvent>();
      expectTypeOf<EventMap['ConnectionEstablished']>().toEqualTypeOf<ConnectionEstablishedEvent>();
      expectTypeOf<EventMap['ConnectionLost']>().toEqualTypeOf<ConnectionLostEvent>();
    });

    it('EventName includes all 6 event names', () => {
      expectTypeOf<'SessionStarted'>().toMatchTypeOf<EventName>();
      expectTypeOf<'ShotRecorded'>().toMatchTypeOf<EventName>();
      expectTypeOf<'ModeSwitched'>().toMatchTypeOf<EventName>();
      expectTypeOf<'SessionReset'>().toMatchTypeOf<EventName>();
      expectTypeOf<'ConnectionEstablished'>().toMatchTypeOf<EventName>();
      expectTypeOf<'ConnectionLost'>().toMatchTypeOf<EventName>();
    });

    it('AnyDomainEvent is a union type of all 6 events', () => {
      expectTypeOf<SessionStartedEvent>().toMatchTypeOf<AnyDomainEvent>();
      expectTypeOf<ShotRecordedEvent>().toMatchTypeOf<AnyDomainEvent>();
      expectTypeOf<ModeSwitchedEvent>().toMatchTypeOf<AnyDomainEvent>();
      expectTypeOf<SessionResetEvent>().toMatchTypeOf<AnyDomainEvent>();
      expectTypeOf<ConnectionEstablishedEvent>().toMatchTypeOf<AnyDomainEvent>();
      expectTypeOf<ConnectionLostEvent>().toMatchTypeOf<AnyDomainEvent>();
    });
  });

  // ============================
  // Runtime tests (integration with TypedEventBus)
  // ============================
  describe('integration with TypedEventBus', () => {
    let bus: TypedEventBus;

    beforeEach(() => {
      bus = new TypedEventBus();
    });

    it('can emit SessionStartedEvent and receive it in a handler', () => {
      const handler = vi.fn();
      bus.on('SessionStarted', handler);

      const event = createSessionStartedEvent();
      bus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
      expect(handler.mock.calls[0]![0].type).toBe('SessionStarted');
      expect(handler.mock.calls[0]![0].discipline).toBe(mockDiscipline);
    });

    it('can emit ShotRecordedEvent and receive it in a handler', () => {
      const handler = vi.fn();
      bus.on('ShotRecorded', handler);

      const event = createShotRecordedEvent();
      bus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0].type).toBe('ShotRecorded');
      expect(handler.mock.calls[0]![0].shot).toBe(mockShot);
    });

    it('can emit ModeSwitchedEvent and receive it in a handler', () => {
      const handler = vi.fn();
      bus.on('ModeSwitched', handler);

      const event = createModeSwitchedEvent();
      bus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0].type).toBe('ModeSwitched');
      expect(handler.mock.calls[0]![0].previousMode).toBe(mockPreviousMode);
      expect(handler.mock.calls[0]![0].newMode).toBe(mockNewMode);
    });

    it('can emit SessionResetEvent and receive it in a handler', () => {
      const handler = vi.fn();
      bus.on('SessionReset', handler);

      const event = createSessionResetEvent();
      bus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0].type).toBe('SessionReset');
    });

    it('can emit ConnectionEstablishedEvent and receive it in a handler', () => {
      const handler = vi.fn();
      bus.on('ConnectionEstablished', handler);

      const event = createConnectionEstablishedEvent();
      bus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0].type).toBe('ConnectionEstablished');
      expect(handler.mock.calls[0]![0].manufacturer).toBe(mockManufacturer);
      expect(handler.mock.calls[0]![0].portPath).toBe('/dev/ttyUSB0');
    });

    it('can emit ConnectionLostEvent and receive it in a handler', () => {
      const handler = vi.fn();
      bus.on('ConnectionLost', handler);

      const event = createConnectionLostEvent();
      bus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0].type).toBe('ConnectionLost');
      expect(handler.mock.calls[0]![0].reason).toBe('Device unplugged');
    });

    it('can emit/receive all 6 event types on the same bus', () => {
      const handlers = {
        SessionStarted: vi.fn(),
        ShotRecorded: vi.fn(),
        ModeSwitched: vi.fn(),
        SessionReset: vi.fn(),
        ConnectionEstablished: vi.fn(),
        ConnectionLost: vi.fn(),
      };

      bus.on('SessionStarted', handlers.SessionStarted);
      bus.on('ShotRecorded', handlers.ShotRecorded);
      bus.on('ModeSwitched', handlers.ModeSwitched);
      bus.on('SessionReset', handlers.SessionReset);
      bus.on('ConnectionEstablished', handlers.ConnectionEstablished);
      bus.on('ConnectionLost', handlers.ConnectionLost);

      bus.emit(createSessionStartedEvent());
      bus.emit(createShotRecordedEvent());
      bus.emit(createModeSwitchedEvent());
      bus.emit(createSessionResetEvent());
      bus.emit(createConnectionEstablishedEvent());
      bus.emit(createConnectionLostEvent());

      // All handlers should be called exactly once
      Object.values(handlers).forEach((handler) => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
    });

    it('on() handler receives correctly typed events for typed event names', () => {
      // TypeScript compile-time type safety verification
      // on('SessionStarted', ...) handler receives SessionStartedEvent
      bus.on('SessionStarted', (event) => {
        // Type-level verification: event.discipline should be of type Discipline
        expectTypeOf(event).toMatchTypeOf<SessionStartedEvent>();
        expectTypeOf(event.discipline).toMatchTypeOf<Discipline>();
      });

      bus.on('ShotRecorded', (event) => {
        expectTypeOf(event).toMatchTypeOf<ShotRecordedEvent>();
        expectTypeOf(event.shot).toMatchTypeOf<Shot>();
      });

      bus.on('ConnectionEstablished', (event) => {
        expectTypeOf(event).toMatchTypeOf<ConnectionEstablishedEvent>();
        expectTypeOf(event.manufacturer).toMatchTypeOf<TargetManufacturer>();
        expectTypeOf(event.portPath).toEqualTypeOf<string>();
      });

      bus.on('ConnectionLost', (event) => {
        expectTypeOf(event).toMatchTypeOf<ConnectionLostEvent>();
        expectTypeOf(event.reason).toEqualTypeOf<string>();
      });
    });
  });
});

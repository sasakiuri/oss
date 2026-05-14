// SPDX-License-Identifier: MIT
import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoundConfig } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type {
  CompetitionFinishedEvent,
  CompetitionStartedEvent,
  ConnectionEstablishedEvent,
  ConnectionLostEvent,
  ModeSwitchedEvent,
  PhaseChangedEvent,
  SeriesCompletedEvent,
  SessionResetEvent,
  SessionStartedEvent,
  ShotRecordedEvent,
  StageAdvancedEvent,
  TimerExpiredEvent,
  TimerTickEvent,
} from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ContractEventForwarder } from '@/main/shared-infra/ipc/ContractEventForwarder';
import type { ShotDto } from '@/shared/ipc/contracts';
import { eventsContract } from '@/shared/ipc/contracts';

// ---------- Mocks ----------

type HandlerMap = Map<string, ((event: unknown) => void)[]>;

interface MockEventBus extends IEventBus {
  handlers: HandlerMap;
}

function createMockEventBus(): MockEventBus {
  const handlers: HandlerMap = new Map();
  return {
    handlers,
    emit: vi.fn(),
    on: vi.fn((eventType: string, handler: (event: unknown) => void) => {
      if (!handlers.has(eventType)) {
        handlers.set(eventType, []);
      }
      const list = handlers.get(eventType);
      list?.push(handler);
      return () => {
        const current = handlers.get(eventType);
        if (current) {
          const idx = current.indexOf(handler);
          if (idx >= 0) current.splice(idx, 1);
        }
      };
    }),
  };
}

function createMockBrowserWindow(destroyed = false): BrowserWindow {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: {
      send: vi.fn(),
    },
  } as unknown as BrowserWindow;
}

// ---------- Test data factories ----------

function createTestShot(): Shot {
  return Shot.create({
    impactPoint: new ImpactPoint(1.5, -2.3),
    score: new Score(98),
    mode: Mode.match(),
    timestamp: new Date('2026-02-18T10:00:00Z'),
    shotNumber: 1,
    seriesNumber: 1,
    innerTen: false,
  });
}

const now = Date.now();

function createShotRecordedEvent(shot: Shot): ShotRecordedEvent {
  return {
    type: 'ShotRecorded',
    timestamp: now,
    aggregateId: 'session-1',
    shot,
    scoringMode: 'DECIMAL',
  };
}

function createConnectionEstablishedEvent(): ConnectionEstablishedEvent {
  return {
    type: 'ConnectionEstablished',
    timestamp: now,
    aggregateId: 'conn-1',
    manufacturer: TargetManufacturer.kohto(),
    portPath: '/dev/ttyUSB0',
    deviceId: null,
  };
}

function createConnectionLostEvent(): ConnectionLostEvent {
  return {
    type: 'ConnectionLost',
    timestamp: now,
    aggregateId: 'conn-1',
    reason: 'Device unplugged',
  };
}

function createSessionStartedEvent(): SessionStartedEvent {
  return {
    type: 'SessionStarted',
    timestamp: now,
    aggregateId: 'session-1',
    discipline: Discipline.airRifle10m(),
  };
}

function createModeSwitchedEvent(): ModeSwitchedEvent {
  return {
    type: 'ModeSwitched',
    timestamp: now,
    aggregateId: 'session-1',
    previousMode: Mode.sighting(),
    newMode: Mode.match(),
  };
}

function createSessionResetEvent(): SessionResetEvent {
  return {
    type: 'SessionReset',
    timestamp: now,
    aggregateId: 'session-1',
  };
}

function createRoundConfig(): RoundConfig {
  return {
    name: 'Qualification',
    stages: [
      {
        name: 'Preparation',
        scored: false,
        series: [{ maxShots: 0 }],
        requiresNewSession: false,
      },
      {
        name: 'Match',
        scored: true,
        series: [{ maxShots: 10 }, { maxShots: 10 }],
        requiresNewSession: true,
      },
    ],
    shotsPerSeries: 10,
    acc: 'DECIMAL',
  };
}

function createCompetitionStartedEvent(): CompetitionStartedEvent {
  return {
    type: 'CompetitionStarted',
    timestamp: now,
    aggregateId: 'comp-1',
    competitionTypeId: 'BR60S',
    sessionId: 'session-1',
    config: createRoundConfig(),
  };
}

function createPhaseChangedEvent(): PhaseChangedEvent {
  return {
    type: 'PhaseChanged',
    timestamp: now,
    aggregateId: 'comp-1',
    previousPhase: 'IDLE',
    newPhase: 'ACTIVE',
    stageIndex: 0,
    seriesIndex: 0,
    stageName: 'Preparation',
    scored: false,
  };
}

function createTimerTickEvent(): TimerTickEvent {
  return {
    type: 'TimerTick',
    timestamp: now,
    aggregateId: 'comp-1',
    remainingSeconds: 55,
    totalSeconds: 60,
    formattedRemaining: '0:55',
  };
}

function createTimerExpiredEvent(): TimerExpiredEvent {
  return {
    type: 'TimerExpired',
    timestamp: now,
    aggregateId: 'comp-1',
    stageIndex: 1,
  };
}

function createSeriesCompletedEvent(): SeriesCompletedEvent {
  return {
    type: 'SeriesCompleted',
    timestamp: now,
    aggregateId: 'comp-1',
    stageIndex: 1,
    seriesIndex: 0,
    shotCount: 10,
  };
}

function createStageAdvancedEvent(): StageAdvancedEvent {
  return {
    type: 'StageAdvanced',
    timestamp: now,
    aggregateId: 'comp-1',
    previousStageIndex: 0,
    newStageIndex: 1,
    stageName: 'Match',
    scored: true,
  };
}

function createCompetitionFinishedEvent(): CompetitionFinishedEvent {
  return {
    type: 'CompetitionFinished',
    timestamp: now,
    aggregateId: 'comp-1',
    sessionId: 'session-1',
  };
}

// ---------- Helpers ----------

function getFirstHandler(bus: MockEventBus, eventType: string): (event: unknown) => void {
  const list = bus.handlers.get(eventType);
  const handler = list?.[0];
  if (!handler) {
    throw new Error(`No handler registered for ${eventType}`);
  }
  return handler;
}

function handlerCount(bus: MockEventBus, eventType: string): number {
  return bus.handlers.get(eventType)?.length ?? 0;
}

// ---------- Tests ----------

describe('ContractEventForwarder', () => {
  let eventBus: MockEventBus;
  let mainWindow: BrowserWindow;
  let forwarder: ContractEventForwarder;

  beforeEach(() => {
    eventBus = createMockEventBus();
    mainWindow = createMockBrowserWindow();
    forwarder = new ContractEventForwarder(eventBus, mainWindow);
  });

  // ============================
  // start() — 15 event forward verification
  // ============================
  describe('start()', () => {
    it('subscribes to 15 events', () => {
      forwarder.start();
      expect(eventBus.on).toHaveBeenCalledTimes(15);
    });

    it('forwards ShotRecorded to event:shotRecorded', () => {
      forwarder.start();
      const shot = createTestShot();
      const event = createShotRecordedEvent(shot);

      getFirstHandler(eventBus, 'ShotRecorded')(event);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.shotRecorded, {
        sessionId: 'session-1',
        shot: {
          id: shot.id,
          shotNumber: 1,
          seriesNumber: 1,
          x: 1.5,
          y: -2.3,
          score: 98,
          innerTen: false,
          timestamp: '2026-02-18T10:00:00.000Z',
          mode: 'MATCH',
          isRecorded: true,
        },
      });
    });

    it('forwards ConnectionEstablished to event:connectionStatusChanged', () => {
      forwarder.start();
      const event = createConnectionEstablishedEvent();

      getFirstHandler(eventBus, 'ConnectionEstablished')(event);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.connectionStatusChanged, {
        connectionId: 'conn-1',
        status: 'connected',
        manufacturer: 'KOHTO',
        portPath: '/dev/ttyUSB0',
        deviceId: null,
      });
    });

    it('forwards ConnectionLost to event:connectionStatusChanged', () => {
      forwarder.start();
      const event = createConnectionLostEvent();

      getFirstHandler(eventBus, 'ConnectionLost')(event);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.connectionStatusChanged, {
        connectionId: 'conn-1',
        status: 'disconnected',
        reason: 'Device unplugged',
      });
    });

    it('forwards SessionStarted to event:sessionStarted', () => {
      forwarder.start();
      const event = createSessionStartedEvent();

      getFirstHandler(eventBus, 'SessionStarted')(event);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.sessionStarted, {
        sessionId: 'session-1',
        discipline: 'AIR_RIFLE_10M',
      });
    });

    it('forwards ModeSwitched to event:modeSwitched', () => {
      forwarder.start();
      const event = createModeSwitchedEvent();

      getFirstHandler(eventBus, 'ModeSwitched')(event);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.modeSwitched, {
        sessionId: 'session-1',
        mode: 'MATCH',
      });
    });

    it('forwards SessionReset to event:sessionReset', () => {
      forwarder.start();
      const event = createSessionResetEvent();

      getFirstHandler(eventBus, 'SessionReset')(event);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.sessionReset, {
        sessionId: 'session-1',
      });
    });

    it('forwards CompetitionStarted to event:competitionStarted', () => {
      forwarder.start();
      const event = createCompetitionStartedEvent();

      getFirstHandler(eventBus, 'CompetitionStarted')(event);

      const config = createRoundConfig();
      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.competitionStarted, {
        competitionId: 'comp-1',
        competitionTypeId: 'BR60S',
        sessionId: 'session-1',
        config,
        shotsPerSeries: 10,
        acc: 'DECIMAL',
      });
    });

    it('forwards PhaseChanged to event:phaseChanged', () => {
      forwarder.start();
      const event = createPhaseChangedEvent();

      getFirstHandler(eventBus, 'PhaseChanged')(event);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.phaseChanged, {
        previousPhase: 'IDLE',
        newPhase: 'ACTIVE',
        stageIndex: 0,
        seriesIndex: 0,
        stageName: 'Preparation',
        scored: false,
      });
    });

    it('forwards TimerTick to event:timerTick', () => {
      forwarder.start();
      const event = createTimerTickEvent();

      getFirstHandler(eventBus, 'TimerTick')(event);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.timerTick, {
        remainingSeconds: 55,
        totalSeconds: 60,
        formattedRemaining: '0:55',
      });
    });

    it('forwards TimerExpired to event:timerExpired', () => {
      forwarder.start();
      const event = createTimerExpiredEvent();

      getFirstHandler(eventBus, 'TimerExpired')(event);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.timerExpired, {
        stageIndex: 1,
      });
    });

    it('forwards SeriesCompleted to event:seriesCompleted', () => {
      forwarder.start();
      const event = createSeriesCompletedEvent();

      getFirstHandler(eventBus, 'SeriesCompleted')(event);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.seriesCompleted, {
        stageIndex: 1,
        seriesIndex: 0,
        shotCount: 10,
      });
    });

    it('forwards StageAdvanced to event:stageAdvanced', () => {
      forwarder.start();
      const event = createStageAdvancedEvent();

      getFirstHandler(eventBus, 'StageAdvanced')(event);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.stageAdvanced, {
        previousStageIndex: 0,
        newStageIndex: 1,
        stageName: 'Match',
        scored: true,
      });
    });

    it('forwards CompetitionFinished to event:competitionFinished', () => {
      forwarder.start();
      const event = createCompetitionFinishedEvent();

      getFirstHandler(eventBus, 'CompetitionFinished')(event);

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(eventsContract.channels.competitionFinished, {
        sessionId: 'session-1',
      });
    });
  });

  // ============================
  // stop() — full unsubscribe verification
  // ============================
  describe('stop()', () => {
    it('unsubscribes from all events', () => {
      forwarder.start();

      // Handlers should be registered for each event
      expect(handlerCount(eventBus, 'ShotRecorded')).toBe(1);
      expect(handlerCount(eventBus, 'ConnectionEstablished')).toBe(1);

      forwarder.stop();

      // All handlers should be removed after unsubscribe
      for (const [, handlers] of eventBus.handlers) {
        expect(handlers.length).toBe(0);
      }
    });

    it('does not send after stop()', () => {
      forwarder.start();
      forwarder.stop();

      // Handler array is empty since handlers were removed
      expect(handlerCount(eventBus, 'ShotRecorded')).toBe(0);

      // send should not have been called
      expect(mainWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('does not throw when stop() is called twice', () => {
      forwarder.start();
      forwarder.stop();

      expect(() => {
        forwarder.stop();
      }).not.toThrow();
    });
  });

  // ============================
  // mainWindow.isDestroyed() === true — skip send
  // ============================
  describe('when mainWindow is destroyed', () => {
    it('does not send when isDestroyed() === true', () => {
      const destroyedWindow = createMockBrowserWindow(true);
      const fwd = new ContractEventForwarder(eventBus, destroyedWindow);
      fwd.start();

      const event = createSessionResetEvent();
      getFirstHandler(eventBus, 'SessionReset')(event);

      expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('stops sending after isDestroyed() becomes true', () => {
      let destroyed = false;
      const dynamicWindow = {
        isDestroyed: vi.fn(() => destroyed),
        webContents: { send: vi.fn() },
      } as unknown as BrowserWindow;

      const fwd = new ContractEventForwarder(eventBus, dynamicWindow);
      fwd.start();

      const handler = getFirstHandler(eventBus, 'SessionReset');

      // First call — not destroyed
      handler(createSessionResetEvent());
      expect(dynamicWindow.webContents.send).toHaveBeenCalledTimes(1);

      // Window destroyed
      destroyed = true;

      // Second call — destroyed
      handler(createSessionResetEvent());
      expect(dynamicWindow.webContents.send).toHaveBeenCalledTimes(1); // Does not increase
    });
  });

  // ============================
  // transformShot() — Shot to ShotDto conversion
  // ============================
  describe('transformShot() — Shot to ShotDto conversion', () => {
    it('maps all Shot fields accurately to ShotDto', () => {
      forwarder.start();
      const shot = createTestShot();
      const event = createShotRecordedEvent(shot);

      getFirstHandler(eventBus, 'ShotRecorded')(event);

      const sentPayload = (mainWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
        shot: ShotDto;
      };
      const shotDto = sentPayload.shot;

      expect(shotDto.id).toBe(shot.id);
      expect(shotDto.shotNumber).toBe(shot.shotNumber);
      expect(shotDto.seriesNumber).toBe(shot.seriesNumber);
      expect(shotDto.x).toBe(shot.impactPoint!.x);
      expect(shotDto.y).toBe(shot.impactPoint!.y);
      expect(shotDto.score).toBe(shot.score.value);
      expect(shotDto.timestamp).toBe(shot.timestamp.toISOString());
      expect(shotDto.mode).toBe(shot.mode.value);
      expect(shotDto.isRecorded).toBe(shot.mode.isMatch());
    });

    it('a sighting mode Shot has isRecorded: false', () => {
      forwarder.start();

      const sightingShot = Shot.create({
        impactPoint: new ImpactPoint(0.5, 0.5),
        score: new Score(80),
        mode: Mode.sighting(),
        timestamp: new Date('2026-02-18T10:01:00Z'),
        shotNumber: 1,
        seriesNumber: 0,
        innerTen: false,
      });

      const event: ShotRecordedEvent = {
        type: 'ShotRecorded',
        timestamp: now,
        aggregateId: 'session-1',
        shot: sightingShot,
        scoringMode: 'DECIMAL',
      };

      getFirstHandler(eventBus, 'ShotRecorded')(event);

      const sentPayload = (mainWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
        shot: ShotDto;
      };
      expect(sentPayload.shot.mode).toBe('SIGHTING');
      expect(sentPayload.shot.isRecorded).toBe(false);
    });
  });

  // ============================
  // start() double invocation — subscription duplication prevention
  // ============================
  describe('start() double invocation', () => {
    it('calling start() twice results in duplicate subscriptions (current implementation behavior)', () => {
      forwarder.start();
      forwarder.start();

      // on is called 30 times (15 x 2)
      expect(eventBus.on).toHaveBeenCalledTimes(30);

      // 2 handlers registered for each event
      expect(handlerCount(eventBus, 'ShotRecorded')).toBe(2);
    });

    it('calling start() after stop() results in only one set of subscriptions', () => {
      forwarder.start();
      forwarder.stop();
      forwarder.start();

      // Only 1 handler per event
      expect(handlerCount(eventBus, 'ShotRecorded')).toBe(1);
      expect(handlerCount(eventBus, 'SessionStarted')).toBe(1);
    });
  });
});

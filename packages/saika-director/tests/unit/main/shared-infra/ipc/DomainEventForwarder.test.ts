import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DomainEventForwarder } from '@/main/shared-infra/ipc/DomainEventForwarder';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { WindowManager } from '@/main/infrastructure/window/WindowManager';
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import type {
  EventForwardingRule,
  TransformerForwardingRule,
  EventTransformer,
} from '@/main/shared-infra/ipc/EventForwardingRule';
import type {
  ShotReceived,
  PhaseChanged,
  LaneConnected,
  TimerTick,
  TimerExpired,
  LaneTimerTick,
  LaneTimerExpired,
  LaneControlUpdated,
  DebugLogEmitted,
} from '@/main/domain/events';
import { eventsContract } from '@/shared/ipc/contracts';
import { DiffCalculator } from '@/main/modules/lane-control';
import type { LaneControlIpcPayload } from '@/shared/types/LaneControlIpcPayload';

/** Maximum sequence number, equal to the largest unsigned 32-bit integer. */
const MAX_SEQ = 0xffffffff;

/**
 * EventTransformer for LaneControlUpdated, reimplemented for tests.
 * Production code is defined in lane-control.module.ts.
 */
class LaneControlUpdatedTransformer implements EventTransformer {
  private diffCalculator = new DiffCalculator<LaneControlIpcPayload>();
  private seqMap = new Map<string, number>();

  forward(event: AnyDomainEvent, send: (ch: string, data: unknown) => void): void {
    const e = event as LaneControlUpdated;
    const current = this.extractPayload(e);
    const { isInitial, patch } = this.diffCalculator.calculateDiff(e.laneId, current);

    if (isInitial) {
      send(eventsContract.channels.laneControlUpdated, {
        laneId: e.laneId,
        ...current,
      });
    } else if (Object.keys(patch).length > 0) {
      const seq = this.getNextSequenceNumber(e.laneId);
      send(eventsContract.channels.laneControlPatched, {
        laneId: e.laneId,
        seq,
        patch,
      });
    }
  }

  cleanup(): void {
    this.diffCalculator.clearAll();
    this.seqMap.clear();
  }

  private extractPayload(event: LaneControlIpcPayload): LaneControlIpcPayload {
    return {
      channel: event.channel,
      playerName: event.playerName,
      affiliation: event.affiliation,
      phase: event.phase,
      remainingTime: event.remainingTime,
      shotNumber: event.shotNumber,
      lastScore: event.lastScore,
      lastShotTime: event.lastShotTime,
      seriesScores: event.seriesScores,
      totalScore: event.totalScore,
      recentShots: event.recentShots,
      matchShots: event.matchShots,
      stageIndex: event.stageIndex,
      seriesIndex: event.seriesIndex,
      roundType: event.roundType,
      unifiedPhase: event.unifiedPhase,
      stageName: event.stageName,
      stage1Total: event.stage1Total,
      stage2Total: event.stage2Total,
      eliminated: event.eliminated,
      eliminationRank: event.eliminationRank,
    };
  }

  private getNextSequenceNumber(laneId: string): number {
    const seq = ((this.seqMap.get(laneId) ?? 0) + 1) % MAX_SEQ;
    this.seqMap.set(laneId, seq);
    return seq;
  }
}

/**
 * Builds event-forwarding rules for tests.
 *
 * Production combines rules returned by each module and the Composition Root.
 * Tests build equivalent rules together here.
 */
function buildTestRules(): (EventForwardingRule | TransformerForwardingRule)[] {
  return [
    // MQTT module rules
    {
      eventType: 'ShotReceived',
      channel: eventsContract.channels.shotReceived,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as ShotReceived;
        return {
          channel: e.channel,
          shotNumber: e.shotNumber,
          score: e.score,
          seriesNumber: e.seriesNumber,
        };
      },
    },
    {
      eventType: 'LaneConnected',
      channel: eventsContract.channels.laneConnected,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as LaneConnected;
        return { channel: e.channel };
      },
    },
    {
      eventType: 'DebugLogEmitted',
      channel: eventsContract.channels.debugLog,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as DebugLogEmitted;
        return {
          timestamp: e.timestamp,
          direction: e.direction,
          raw: e.raw,
          parsed: e.parsed,
        };
      },
    },
    // Lane-control module rules
    {
      eventType: 'LaneControlUpdated',
      transformer: new LaneControlUpdatedTransformer(),
    },
    {
      eventType: 'LaneTimerTick',
      channel: eventsContract.channels.laneTimerTick,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as LaneTimerTick;
        return {
          laneId: e.laneId,
          remainingTime: e.remainingTime,
          phase: e.phase,
        };
      },
    },
    {
      eventType: 'LaneTimerExpired',
      channel: eventsContract.channels.laneTimerExpired,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as LaneTimerExpired;
        return {
          laneId: e.laneId,
          phase: e.phase,
        };
      },
    },
    // Core event rules (from Composition Root)
    {
      eventType: 'PhaseChanged',
      channel: eventsContract.channels.phaseChanged,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as PhaseChanged;
        return {
          phase: e.phase,
          remainingTime: e.remainingTime,
        };
      },
    },
    {
      eventType: 'TimerTick',
      channel: eventsContract.channels.timerTick,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as TimerTick;
        return {
          remainingTime: e.remainingTime,
          phase: e.phase,
        };
      },
    },
    {
      eventType: 'TimerExpired',
      channel: eventsContract.channels.timerExpired,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as TimerExpired;
        return { phase: e.phase };
      },
    },
  ];
}

describe('DomainEventForwarder', () => {
  let mockEventBus: IEventBus;
  let mockWindowManager: WindowManager;
  let forwarder: DomainEventForwarder;
  let eventHandlers: Map<string, (event: unknown) => void>;

  beforeEach(() => {
    eventHandlers = new Map();

    mockEventBus = {
      on: vi.fn((eventType: string, handler: (event: unknown) => void) => {
        eventHandlers.set(eventType, handler);
        return vi.fn(() => {
          eventHandlers.delete(eventType);
        });
      }),
      emit: vi.fn(),
    } as unknown as IEventBus;

    mockWindowManager = {
      broadcast: vi.fn(),
    } as unknown as WindowManager;

    forwarder = new DomainEventForwarder(mockEventBus, mockWindowManager, buildTestRules());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('start()', () => {
    it('should register listeners for all domain events on EventBus', () => {
      forwarder.start();

      const expectedEventTypes = [
        'ShotReceived',
        'PhaseChanged',
        'LaneConnected',
        'TimerTick',
        'TimerExpired',
        'LaneTimerTick',
        'LaneTimerExpired',
        'LaneControlUpdated',
        'DebugLogEmitted',
      ];

      expect(mockEventBus.on).toHaveBeenCalledTimes(expectedEventTypes.length);

      expectedEventTypes.forEach((eventType) => {
        expect(mockEventBus.on).toHaveBeenCalledWith(eventType, expect.any(Function));
      });
    });

    it('should store unsubscribers for later cleanup', () => {
      forwarder.start();
      forwarder.stop();
      expect(eventHandlers.size).toBe(0);
    });

    it('should prevent multiple start() calls (guard against duplicate listeners)', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      forwarder.start();
      const firstCallCount = (mockEventBus.on as ReturnType<typeof vi.fn>).mock.calls.length;

      forwarder.start();
      const secondCallCount = (mockEventBus.on as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[WARN] [DomainEventForwarder] Already started. Ignoring duplicate start() call.',
      );

      consoleWarnSpy.mockRestore();
    });

    it('should allow start() after stop()', () => {
      forwarder.start();
      const firstCallCount = (mockEventBus.on as ReturnType<typeof vi.fn>).mock.calls.length;

      forwarder.stop();
      forwarder.start();

      const secondCallCount = (mockEventBus.on as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount * 2);
    });
  });

  describe('ShotReceived event forwarding', () => {
    it('should forward ShotReceived event to correct IPC channel', () => {
      forwarder.start();

      const shotReceivedEvent: ShotReceived = {
        type: 'ShotReceived',
        timestamp: Date.now(),
        competitionId: 'test-competition',
        channel: 3,
        shotNumber: 15,
        score: 10.5,
        seriesNumber: 2,
      };

      const handler = eventHandlers.get('ShotReceived');
      expect(handler).toBeDefined();
      handler!(shotReceivedEvent);

      expect(mockWindowManager.broadcast).toHaveBeenCalledTimes(1);
      expect(mockWindowManager.broadcast).toHaveBeenCalledWith(eventsContract.channels.shotReceived, {
        channel: 3,
        shotNumber: 15,
        score: 10.5,
        seriesNumber: 2,
      });
    });

    it('should forward multiple ShotReceived events', () => {
      forwarder.start();

      const event1: ShotReceived = {
        type: 'ShotReceived',
        timestamp: Date.now(),
        competitionId: 'test-competition',
        channel: 1,
        shotNumber: 1,
        score: 9.5,
        seriesNumber: 1,
      };
      const event2: ShotReceived = {
        type: 'ShotReceived',
        timestamp: Date.now(),
        competitionId: 'test-competition',
        channel: 2,
        shotNumber: 2,
        score: 10.0,
        seriesNumber: 1,
      };

      const handler = eventHandlers.get('ShotReceived');
      handler!(event1);
      handler!(event2);

      expect(mockWindowManager.broadcast).toHaveBeenCalledTimes(2);
    });
  });

  describe('LaneControlUpdated event forwarding with diff calculation', () => {
    it('should send full data on first LaneControlUpdated event', () => {
      forwarder.start();

      const laneControlEvent: LaneControlUpdated = {
        type: 'LaneControlUpdated',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Test Player',
        affiliation: 'Test Affiliation',
        phase: 'ACTIVE',
        remainingTime: 2700,
        shotNumber: 10,
        lastScore: 10.5,
        lastShotTime: Date.now(),
        seriesScores: [100, 95.5, 0, 0, 0, 0],
        totalScore: 195.5,
        recentShots: [10.5, 10.0, 9.5],
        matchShots: [],
        stageIndex: 1,
        seriesIndex: 0,
        roundType: 'Qualification' as const,
        unifiedPhase: 'ACTIVE',
        stageName: 'Series 1',
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      };

      const handler = eventHandlers.get('LaneControlUpdated');
      handler!(laneControlEvent);

      expect(mockWindowManager.broadcast).toHaveBeenCalledTimes(1);
      expect(mockWindowManager.broadcast).toHaveBeenCalledWith(eventsContract.channels.laneControlUpdated, {
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Test Player',
        affiliation: 'Test Affiliation',
        phase: 'ACTIVE',
        remainingTime: 2700,
        shotNumber: 10,
        lastScore: 10.5,
        lastShotTime: laneControlEvent.lastShotTime,
        seriesScores: [100, 95.5, 0, 0, 0, 0],
        totalScore: 195.5,
        recentShots: [10.5, 10.0, 9.5],
        matchShots: [],
        stageIndex: 1,
        seriesIndex: 0,
        roundType: 'Qualification',
        unifiedPhase: 'ACTIVE',
        stageName: 'Series 1',
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      });
    });

    it('should send diff patch on subsequent LaneControlUpdated events with changes', () => {
      forwarder.start();

      const firstEvent: LaneControlUpdated = {
        type: 'LaneControlUpdated',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Test Player',
        affiliation: 'Test Affiliation',
        phase: 'ACTIVE',
        remainingTime: 2700,
        shotNumber: 10,
        lastScore: 10.5,
        lastShotTime: 1000,
        seriesScores: [100, 95.5, 0, 0, 0, 0],
        totalScore: 195.5,
        recentShots: [10.5, 10.0, 9.5],
        matchShots: [],
        stageIndex: 1,
        seriesIndex: 0,
        roundType: 'Qualification' as const,
        unifiedPhase: 'ACTIVE',
        stageName: 'Series 1',
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      };

      const secondEvent: LaneControlUpdated = {
        type: 'LaneControlUpdated',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Test Player',
        affiliation: 'Test Affiliation',
        phase: 'ACTIVE',
        remainingTime: 2699,
        shotNumber: 11,
        lastScore: 9.5,
        lastShotTime: 2000,
        seriesScores: [100, 105.0, 0, 0, 0, 0],
        totalScore: 205.0,
        recentShots: [10.5, 10.0, 9.5, 9.5],
        matchShots: [],
        stageIndex: 1,
        seriesIndex: 0,
        roundType: 'Qualification' as const,
        unifiedPhase: 'ACTIVE',
        stageName: 'Series 1',
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      };

      const handler = eventHandlers.get('LaneControlUpdated');
      handler!(firstEvent);
      handler!(secondEvent);

      expect(mockWindowManager.broadcast).toHaveBeenCalledTimes(2);

      const secondCall = (mockWindowManager.broadcast as ReturnType<typeof vi.fn>).mock.calls[1]!;
      expect(secondCall[0]).toBe(eventsContract.channels.laneControlPatched);
      expect(secondCall[1] as Record<string, unknown>).toMatchObject({
        laneId: 'lane-1',
        seq: 1,
        patch: {
          remainingTime: 2699,
          shotNumber: 11,
          lastScore: 9.5,
          lastShotTime: 2000,
          seriesScores: [100, 105.0, 0, 0, 0, 0],
          totalScore: 205.0,
          recentShots: [10.5, 10.0, 9.5, 9.5],
        },
      });
    });

    it('should not send anything when LaneControlUpdated has no changes', () => {
      forwarder.start();

      const firstEvent: LaneControlUpdated = {
        type: 'LaneControlUpdated',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Test Player',
        affiliation: 'Test Affiliation',
        phase: 'ACTIVE',
        remainingTime: 2700,
        shotNumber: 10,
        lastScore: 10.5,
        lastShotTime: 1000,
        seriesScores: [100, 95.5, 0, 0, 0, 0],
        totalScore: 195.5,
        recentShots: [10.5, 10.0, 9.5],
        matchShots: [],
        stageIndex: 1,
        seriesIndex: 0,
        roundType: 'Qualification' as const,
        unifiedPhase: 'ACTIVE',
        stageName: 'Series 1',
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      };

      const secondEvent: LaneControlUpdated = {
        ...firstEvent,
        timestamp: Date.now() + 1000,
      };

      const handler = eventHandlers.get('LaneControlUpdated');
      handler!(firstEvent);
      handler!(secondEvent);

      expect(mockWindowManager.broadcast).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple lanes independently', () => {
      forwarder.start();

      const lane1Event: LaneControlUpdated = {
        type: 'LaneControlUpdated',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Player 1',
        affiliation: 'Affiliation 1',
        phase: 'ACTIVE',
        remainingTime: 2700,
        shotNumber: 5,
        lastScore: 10.0,
        lastShotTime: 1000,
        seriesScores: [50, 0, 0, 0, 0, 0],
        totalScore: 50,
        recentShots: [10.0],
        matchShots: [],
        stageIndex: 1,
        seriesIndex: 0,
        roundType: 'Qualification' as const,
        unifiedPhase: 'ACTIVE',
        stageName: 'Series 1',
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      };

      const lane2Event: LaneControlUpdated = {
        type: 'LaneControlUpdated',
        timestamp: Date.now(),
        laneId: 'lane-2',
        channel: 2,
        playerName: 'Player 2',
        affiliation: 'Affiliation 2',
        phase: 'ACTIVE',
        remainingTime: 600,
        shotNumber: 0,
        lastScore: null,
        lastShotTime: null,
        seriesScores: [0, 0, 0, 0, 0, 0],
        totalScore: 0,
        recentShots: [],
        matchShots: [],
        stageIndex: 1,
        seriesIndex: 0,
        roundType: 'Qualification' as const,
        unifiedPhase: 'ACTIVE',
        stageName: 'Series 1',
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      };

      const handler = eventHandlers.get('LaneControlUpdated');
      handler!(lane1Event);
      handler!(lane2Event);

      expect(mockWindowManager.broadcast).toHaveBeenCalledTimes(2);
    });

    it('should increment sequence number for each patch', () => {
      forwarder.start();

      const createEvent = (shotNumber: number): LaneControlUpdated => ({
        type: 'LaneControlUpdated',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Test Player',
        affiliation: 'Test Affiliation',
        phase: 'ACTIVE',
        remainingTime: 2700,
        shotNumber,
        lastScore: 10.0,
        lastShotTime: 1000 + shotNumber,
        seriesScores: [100, 0, 0, 0, 0, 0],
        totalScore: 100,
        recentShots: [10.0],
        matchShots: [],
        stageIndex: 1,
        seriesIndex: 0,
        roundType: 'Qualification' as const,
        unifiedPhase: 'ACTIVE',
        stageName: 'Series 1',
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      });

      const handler = eventHandlers.get('LaneControlUpdated');
      handler!(createEvent(1));
      handler!(createEvent(2)); // seq: 1
      handler!(createEvent(3)); // seq: 2
      handler!(createEvent(4)); // seq: 3

      expect(mockWindowManager.broadcast).toHaveBeenCalledTimes(4);

      const calls = (mockWindowManager.broadcast as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[1]![1] as Record<string, unknown>).seq).toBe(1);
      expect((calls[2]![1] as Record<string, unknown>).seq).toBe(2);
      expect((calls[3]![1] as Record<string, unknown>).seq).toBe(3);
    });
  });

  describe('Other event forwarding', () => {
    it('should forward PhaseChanged event', () => {
      forwarder.start();

      const event: PhaseChanged = {
        type: 'PhaseChanged',
        timestamp: Date.now(),
        competitionId: 'test-competition',
        phase: 'ACTIVE',
        remainingTime: 2700,
      };

      const handler = eventHandlers.get('PhaseChanged');
      handler!(event);

      expect(mockWindowManager.broadcast).toHaveBeenCalledWith(eventsContract.channels.phaseChanged, {
        phase: 'ACTIVE',
        remainingTime: 2700,
      });
    });

    it('should forward LaneConnected event', () => {
      forwarder.start();

      const event: LaneConnected = {
        type: 'LaneConnected',
        timestamp: Date.now(),
        laneId: '11111111-1111-4111-8111-111111111111',
        channel: 3,
      };

      const handler = eventHandlers.get('LaneConnected');
      handler!(event);

      expect(mockWindowManager.broadcast).toHaveBeenCalledWith(eventsContract.channels.laneConnected, { channel: 3 });
    });

    it('should forward TimerTick event', () => {
      forwarder.start();

      const event: TimerTick = {
        type: 'TimerTick',
        timestamp: Date.now(),
        remainingTime: 2699,
        phase: 'ACTIVE',
      };

      const handler = eventHandlers.get('TimerTick');
      handler!(event);

      expect(mockWindowManager.broadcast).toHaveBeenCalledWith(eventsContract.channels.timerTick, {
        remainingTime: 2699,
        phase: 'ACTIVE',
      });
    });

    it('should forward TimerExpired event', () => {
      forwarder.start();

      const event: TimerExpired = {
        type: 'TimerExpired',
        timestamp: Date.now(),
        phase: 'ACTIVE',
      };

      const handler = eventHandlers.get('TimerExpired');
      handler!(event);

      expect(mockWindowManager.broadcast).toHaveBeenCalledWith(eventsContract.channels.timerExpired, {
        phase: 'ACTIVE',
      });
    });

    it('should forward LaneTimerTick event', () => {
      forwarder.start();

      const event: LaneTimerTick = {
        type: 'LaneTimerTick',
        timestamp: Date.now(),
        laneId: 'lane-1',
        remainingTime: 2699,
        phase: 'ACTIVE',
      };

      const handler = eventHandlers.get('LaneTimerTick');
      handler!(event);

      expect(mockWindowManager.broadcast).toHaveBeenCalledWith(eventsContract.channels.laneTimerTick, {
        laneId: 'lane-1',
        remainingTime: 2699,
        phase: 'ACTIVE',
      });
    });

    it('should forward LaneTimerExpired event', () => {
      forwarder.start();

      const event: LaneTimerExpired = {
        type: 'LaneTimerExpired',
        timestamp: Date.now(),
        laneId: 'lane-1',
        phase: 'ACTIVE',
      };

      const handler = eventHandlers.get('LaneTimerExpired');
      handler!(event);

      expect(mockWindowManager.broadcast).toHaveBeenCalledWith(eventsContract.channels.laneTimerExpired, {
        laneId: 'lane-1',
        phase: 'ACTIVE',
      });
    });

    it('should forward DebugLogEmitted event', () => {
      forwarder.start();

      const event: DebugLogEmitted = {
        type: 'DebugLogEmitted',
        timestamp: Date.now(),
        direction: 'TX',
        raw: 'test raw',
        parsed: 'test parsed data',
      };

      const handler = eventHandlers.get('DebugLogEmitted');
      handler!(event);

      expect(mockWindowManager.broadcast).toHaveBeenCalledWith(eventsContract.channels.debugLog, {
        timestamp: event.timestamp,
        direction: 'TX',
        raw: 'test raw',
        parsed: 'test parsed data',
      });
    });
  });

  describe('stop()', () => {
    it('should call all unsubscribers', () => {
      forwarder.start();

      const initialHandlerCount = eventHandlers.size;
      expect(initialHandlerCount).toBeGreaterThan(0);

      forwarder.stop();

      expect(eventHandlers.size).toBe(0);
    });

    it('should clear diff calculator state', () => {
      forwarder.start();

      const event: LaneControlUpdated = {
        type: 'LaneControlUpdated',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Test Player',
        affiliation: 'Test Affiliation',
        phase: 'ACTIVE',
        remainingTime: 2700,
        shotNumber: 10,
        lastScore: 10.5,
        lastShotTime: 1000,
        seriesScores: [100, 0, 0, 0, 0, 0],
        totalScore: 100,
        recentShots: [10.5],
        matchShots: [],
        stageIndex: 1,
        seriesIndex: 0,
        roundType: 'Qualification' as const,
        unifiedPhase: 'ACTIVE',
        stageName: 'Series 1',
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      };

      const handler = eventHandlers.get('LaneControlUpdated');
      handler!(event);

      forwarder.stop();

      forwarder.start();
      const newHandler = eventHandlers.get('LaneControlUpdated');
      newHandler!(event);

      const calls = (mockWindowManager.broadcast as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1]!;
      expect(lastCall[0]).toBe(eventsContract.channels.laneControlUpdated);
    });

    it('should clear sequence numbers', () => {
      forwarder.start();

      const event: LaneControlUpdated = {
        type: 'LaneControlUpdated',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Test Player',
        affiliation: 'Test Affiliation',
        phase: 'ACTIVE',
        remainingTime: 2700,
        shotNumber: 10,
        lastScore: 10.5,
        lastShotTime: 1000,
        seriesScores: [100, 0, 0, 0, 0, 0],
        totalScore: 100,
        recentShots: [10.5],
        matchShots: [],
        stageIndex: 1,
        seriesIndex: 0,
        roundType: 'Qualification' as const,
        unifiedPhase: 'ACTIVE',
        stageName: 'Series 1',
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      };

      const handler = eventHandlers.get('LaneControlUpdated');
      handler!(event);
      handler!({ ...event, shotNumber: 11, lastShotTime: 2000 });

      forwarder.stop();
      forwarder.start();

      const newHandler = eventHandlers.get('LaneControlUpdated');
      newHandler!(event);
      newHandler!({ ...event, shotNumber: 11, lastShotTime: 2000 });

      const calls = (mockWindowManager.broadcast as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[3]![1] as Record<string, unknown>).seq).toBe(1);
    });

    it('should be safe to call stop() without start()', () => {
      expect(() => forwarder.stop()).not.toThrow();
    });

    it('should be safe to call stop() multiple times', () => {
      forwarder.start();
      forwarder.stop();
      expect(() => forwarder.stop()).not.toThrow();
    });

    it('should not broadcast events after stop()', () => {
      forwarder.start();
      // Store handler reference to verify it's removed after stop
      const handlerBeforeStop = eventHandlers.get('ShotReceived');
      expect(handlerBeforeStop).toBeDefined();

      forwarder.stop();

      expect(eventHandlers.has('ShotReceived')).toBe(false);
    });
  });

  describe('error resilience', () => {
    it('should continue forwarding other events if broadcast throws', () => {
      let callCount = 0;
      mockWindowManager = {
        broadcast: vi.fn(() => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Broadcast failed');
          }
        }),
      } as unknown as WindowManager;

      forwarder = new DomainEventForwarder(mockEventBus, mockWindowManager, buildTestRules());
      forwarder.start();

      const event1: ShotReceived = {
        type: 'ShotReceived',
        timestamp: Date.now(),
        competitionId: 'test-competition',
        channel: 1,
        shotNumber: 1,
        score: 10.0,
        seriesNumber: 1,
      };

      const handler = eventHandlers.get('ShotReceived');

      expect(() => handler!(event1)).toThrow('Broadcast failed');

      expect(() => handler!(event1)).not.toThrow();
      expect(mockWindowManager.broadcast).toHaveBeenCalledTimes(2);
    });
  });

  describe('sequence number edge cases', () => {
    it('should handle sequence number wrap-around at MAX_SEQ', () => {
      // MAX_SEQ = 0xFFFFFFFF = 4294967295
      forwarder.start();

      const createEvent = (shotNumber: number): LaneControlUpdated => ({
        type: 'LaneControlUpdated',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Test Player',
        affiliation: 'Test Affiliation',
        phase: 'ACTIVE',
        remainingTime: 2700,
        shotNumber,
        lastScore: 10.0,
        lastShotTime: 1000 + shotNumber,
        seriesScores: [100, 0, 0, 0, 0, 0],
        totalScore: 100,
        recentShots: [10.0],
        matchShots: [],
        stageIndex: 1,
        seriesIndex: 0,
        roundType: 'Qualification' as const,
        unifiedPhase: 'ACTIVE',
        stageName: 'Series 1',
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      });

      const handler = eventHandlers.get('LaneControlUpdated');
      handler!(createEvent(1));
      handler!(createEvent(2)); // seq: 1
      handler!(createEvent(3)); // seq: 2

      const calls = (mockWindowManager.broadcast as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[1]![1] as Record<string, unknown>).seq).toBe(1);
      expect((calls[2]![1] as Record<string, unknown>).seq).toBe(2);
    });
  });
});

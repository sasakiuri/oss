import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShootoffCommandHandler } from '@/main/modules/shootoff/commands/ShootoffCommandHandler';
import type {
  StartShootoffCommand,
  AddShootoffShotCommand,
  ResolveShootoffCommand,
} from '@/main/modules/shootoff/commands/ShootoffCommands';
import type { IShootoffRepository } from '@/main/modules/shootoff/domain/IShootoffRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { AnyDomainEvent } from '@/main/domain/events';
import { FinalShootoff } from '@/main/modules/shootoff/domain/FinalShootoff';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { ParticipantId } from '@/main/modules/championship/domain/ParticipantId';
import { buildFinalConfig } from '../../../../../helpers/testConfigs';
import { DomainError } from '@/shared/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a PHASE_COMPLETE Lane after Final 1st Stage series 1.
 * The resulting Lane can call startShootoff().
 */
function createPhaseCompleteFinalLane(id: string, channelNum: number, participantId: string): LaneControl {
  const config = buildFinalConfig(2);
  let lane = LaneControl.create(id, Channel.create(channelNum), config);
  lane = lane.assignPlayer(Player.create(`Player ${channelNum}`, 'Aff', participantId));
  lane = lane.startPreparation(); // IDLE -> ACTIVE (preparation, stageGroup=0)
  lane = lane.advanceToNextStage(); // -> STAGE_ENTERED (stageGroup=1, 1st Stage)
  lane = lane.startMatch(); // -> ACTIVE (1st Stage series 1, shotsRequired=5)

  // series 1 = 5 shots (1st Stage, series[0])
  const shotsRequired = config.stages[1]!.series[0]!.shots;
  for (let i = 1; i <= shotsRequired; i++) {
    lane = lane.addShotByScore(10.0, Date.now(), i);
  }
  // After all required shots, lane transitions to PHASE_COMPLETE
  return lane;
}

// ---------------------------------------------------------------------------
// In-memory stores & mock factories
// ---------------------------------------------------------------------------

function createStores() {
  const laneStore = new Map<string, LaneControl>();
  const shootoffStore = new Map<string, FinalShootoff>();
  return { laneStore, shootoffStore };
}

function resolveName(tokenOrName: any): string {
  return typeof tokenOrName === 'string' ? tokenOrName : tokenOrName.name;
}

function createMockQueryBus(laneStore: Map<string, LaneControl>) {
  return {
    execute: vi.fn(async (tokenOrName: any, query: any) => {
      const name = resolveName(tokenOrName);
      if (name === 'GetLaneById') {
        return laneStore.get(query.laneId);
      }
      return undefined;
    }),
    register: vi.fn(),
    use: vi.fn(),
  };
}

function createMockCommandBus(laneStore: Map<string, LaneControl>) {
  return {
    execute: vi.fn(async (tokenOrName: any, cmd: any) => {
      const name = resolveName(tokenOrName);
      if (name === 'StartLaneShootoff') {
        const lane = laneStore.get(cmd.laneId);
        if (lane) {
          const updated = lane.startShootoff();
          laneStore.set(cmd.laneId, updated);
        }
      }
      if (name === 'AddLaneShootoffShot') {
        const lane = laneStore.get(cmd.laneId);
        if (lane) {
          const updated = lane.addShootoffShot(cmd.score);
          laneStore.set(cmd.laneId, updated);
        }
      }
      if (name === 'ResolveLaneShootoff') {
        const lane = laneStore.get(cmd.laneId);
        if (lane) {
          const updated = lane.resolveShootoff();
          laneStore.set(cmd.laneId, updated);
        }
      }
      if (name === 'EliminatePlayer') {
        const lane = laneStore.get(cmd.laneId);
        if (lane) {
          const updated = lane.eliminate(cmd.rank);
          laneStore.set(cmd.laneId, updated);
        }
      }
    }),
    register: vi.fn(),
    use: vi.fn(),
  };
}

function createMockShootoffRepo(store: Map<string, FinalShootoff>): IShootoffRepository {
  return {
    save: vi.fn((s: FinalShootoff) => {
      store.set(s.id.value, s);
    }),
    saveWithEventId: vi.fn((s: FinalShootoff) => {
      store.set(s.id.value, s);
    }),
    findById: vi.fn((id: string) => store.get(id)),
    findByEventId: vi.fn(() => []),
    delete: vi.fn(),
  };
}

function createMockEventBus(): IEventBus & { emittedEvents: AnyDomainEvent[] } {
  const emittedEvents: AnyDomainEvent[] = [];
  return {
    emittedEvents,
    emit: vi.fn((event: AnyDomainEvent) => {
      emittedEvents.push(event);
    }),
    on: vi.fn(() => () => {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShootoffCommandHandler', () => {
  let laneStore: Map<string, LaneControl>;
  let shootoffStore: Map<string, FinalShootoff>;
  let mockCommandBus: ReturnType<typeof createMockCommandBus>;
  let mockQueryBus: ReturnType<typeof createMockQueryBus>;
  let shootoffRepo: IShootoffRepository;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let handler: ShootoffCommandHandler;

  beforeEach(() => {
    const stores = createStores();
    laneStore = stores.laneStore;
    shootoffStore = stores.shootoffStore;
    mockCommandBus = createMockCommandBus(laneStore);
    mockQueryBus = createMockQueryBus(laneStore);
    shootoffRepo = createMockShootoffRepo(shootoffStore);
    eventBus = createMockEventBus();
    handler = new ShootoffCommandHandler(shootoffRepo, mockCommandBus as any, mockQueryBus as any, eventBus);
  });

  // =========================================================================
  // executeStartShootoff
  // =========================================================================
  describe('executeStartShootoff', () => {
    it('should create a shootoff and return a shootoffId', async () => {
      const lane1 = createPhaseCompleteFinalLane('lane-1', 1, 'p-1');
      const lane2 = createPhaseCompleteFinalLane('lane-2', 2, 'p-2');
      laneStore.set('lane-1', lane1);
      laneStore.set('lane-2', lane2);

      const command: StartShootoffCommand = {
        eventId: 'event-1',
        targetLaneIds: ['lane-1', 'lane-2'],
        contestedRank: 3,
      };

      const result = await handler.executeStartShootoff(command);

      expect(result.shootoffId).toBeDefined();
      expect(typeof result.shootoffId).toBe('string');
      expect(result.shootoffId.length).toBeGreaterThan(0);
    });

    it('should save the shootoff to the repository', async () => {
      const lane1 = createPhaseCompleteFinalLane('lane-1', 1, 'p-1');
      const lane2 = createPhaseCompleteFinalLane('lane-2', 2, 'p-2');
      laneStore.set('lane-1', lane1);
      laneStore.set('lane-2', lane2);

      const command: StartShootoffCommand = {
        eventId: 'event-1',
        targetLaneIds: ['lane-1', 'lane-2'],
        contestedRank: 3,
      };

      const result = await handler.executeStartShootoff(command);

      expect(shootoffRepo.saveWithEventId).toHaveBeenCalledWith(expect.any(FinalShootoff), 'event-1');
      expect(shootoffRepo.save).not.toHaveBeenCalled();
      const saved = shootoffStore.get(result.shootoffId);
      expect(saved).toBeDefined();
      expect(saved!.contestedRank).toBe(3);
      expect(saved!.targetParticipantIds).toHaveLength(2);
    });

    it('should transition target lanes to SHOOTOFF phase', async () => {
      const lane1 = createPhaseCompleteFinalLane('lane-1', 1, 'p-1');
      const lane2 = createPhaseCompleteFinalLane('lane-2', 2, 'p-2');
      laneStore.set('lane-1', lane1);
      laneStore.set('lane-2', lane2);

      const command: StartShootoffCommand = {
        eventId: 'event-1',
        targetLaneIds: ['lane-1', 'lane-2'],
        contestedRank: 3,
      };

      await handler.executeStartShootoff(command);

      const updatedLane1 = laneStore.get('lane-1');
      const updatedLane2 = laneStore.get('lane-2');
      expect(updatedLane1!.phase).toBe('SHOOTOFF');
      expect(updatedLane2!.phase).toBe('SHOOTOFF');
    });

    it('should emit ShootoffStarted event', async () => {
      const lane1 = createPhaseCompleteFinalLane('lane-1', 1, 'p-1');
      const lane2 = createPhaseCompleteFinalLane('lane-2', 2, 'p-2');
      laneStore.set('lane-1', lane1);
      laneStore.set('lane-2', lane2);

      const command: StartShootoffCommand = {
        eventId: 'event-1',
        targetLaneIds: ['lane-1', 'lane-2'],
        contestedRank: 3,
      };

      const result = await handler.executeStartShootoff(command);

      expect(eventBus.emit).toHaveBeenCalledTimes(1);
      const emitted = eventBus.emittedEvents[0]!;
      expect(emitted.type).toBe('ShootoffStarted');
      expect((emitted as any).shootoffId).toBe(result.shootoffId);
      expect((emitted as any).eventId).toBe('event-1');
      expect((emitted as any).targetLaneIds).toEqual(['lane-1', 'lane-2']);
      expect((emitted as any).contestedRank).toBe(3);
    });

    it('should throw DomainError when a lane is not found', async () => {
      // lane-1 exists, lane-2 does not
      const lane1 = createPhaseCompleteFinalLane('lane-1', 1, 'p-1');
      laneStore.set('lane-1', lane1);

      const command: StartShootoffCommand = {
        eventId: 'event-1',
        targetLaneIds: ['lane-1', 'lane-missing'],
        contestedRank: 3,
      };

      await expect(handler.executeStartShootoff(command)).rejects.toThrow(DomainError);
      await expect(handler.executeStartShootoff(command)).rejects.toThrow(/Lane not found/);
    });

    it('should throw DomainError when a lane has no player assigned', async () => {
      // Create a lane without a player (in PHASE_COMPLETE to avoid other errors)
      const config = buildFinalConfig(2);
      const laneNoPlayer = LaneControl.create('lane-no-player', Channel.create(1), config);
      laneStore.set('lane-no-player', laneNoPlayer);

      const command: StartShootoffCommand = {
        eventId: 'event-1',
        targetLaneIds: ['lane-no-player'],
        contestedRank: 3,
      };

      await expect(handler.executeStartShootoff(command)).rejects.toThrow(DomainError);
      await expect(handler.executeStartShootoff(command)).rejects.toThrow(/no player/);
    });

    it('should validate every lane phase before transitioning any lane', async () => {
      const lane1 = createPhaseCompleteFinalLane('lane-1', 1, 'p-1');
      const lane2 = createPhaseCompleteFinalLane('lane-2', 2, 'p-2').startShootoff();
      laneStore.set('lane-1', lane1);
      laneStore.set('lane-2', lane2);

      await expect(
        handler.executeStartShootoff({
          eventId: 'event-1',
          targetLaneIds: ['lane-1', 'lane-2'],
          contestedRank: 3,
        }),
      ).rejects.toThrow(/cannot start a shoot-off/);

      expect(laneStore.get('lane-1')?.phase).toBe('SERIES_COMPLETE');
      expect(laneStore.get('lane-2')?.phase).toBe('SHOOTOFF');
      expect(mockCommandBus.execute).not.toHaveBeenCalled();
      expect(shootoffRepo.saveWithEventId).not.toHaveBeenCalled();
    });

    it('should reject duplicate participants before transitioning any lane', async () => {
      const lane1 = createPhaseCompleteFinalLane('lane-1', 1, 'p-1');
      const lane2 = createPhaseCompleteFinalLane('lane-2', 2, 'p-1');
      laneStore.set('lane-1', lane1);
      laneStore.set('lane-2', lane2);

      await expect(
        handler.executeStartShootoff({
          eventId: 'event-1',
          targetLaneIds: ['lane-1', 'lane-2'],
          contestedRank: 3,
        }),
      ).rejects.toMatchObject({ code: 'SHOOTOFF_008' });

      expect(laneStore.get('lane-1')?.phase).toBe('SERIES_COMPLETE');
      expect(laneStore.get('lane-2')?.phase).toBe('SERIES_COMPLETE');
      expect(mockCommandBus.execute).not.toHaveBeenCalled();
      expect(shootoffRepo.saveWithEventId).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // executeAddShootoffShot
  // =========================================================================
  describe('executeAddShootoffShot', () => {
    async function setupShootoff(): Promise<string> {
      const lane1 = createPhaseCompleteFinalLane('lane-1', 1, 'p-1');
      const lane2 = createPhaseCompleteFinalLane('lane-2', 2, 'p-2');
      laneStore.set('lane-1', lane1);
      laneStore.set('lane-2', lane2);

      const startCmd: StartShootoffCommand = {
        eventId: 'event-1',
        targetLaneIds: ['lane-1', 'lane-2'],
        contestedRank: 3,
      };
      const { shootoffId } = await handler.executeStartShootoff(startCmd);
      // Reset event bus tracking after start
      eventBus.emittedEvents.length = 0;
      vi.mocked(eventBus.emit).mockClear();
      return shootoffId;
    }

    it('should add a shootoff shot to the lane and emit event', async () => {
      const shootoffId = await setupShootoff();

      const command: AddShootoffShotCommand = {
        shootoffId,
        laneId: 'lane-1',
        score: 10.5,
      };

      await handler.executeAddShootoffShot(command);

      // Lane should have shootoff shot added
      const updatedLane = laneStore.get('lane-1');
      expect(updatedLane!.shootoffShots).toHaveLength(1);
      expect(updatedLane!.shootoffShots[0]!.score.value).toBe(10.5);

      // Event should be emitted
      expect(eventBus.emit).toHaveBeenCalledTimes(1);
      const emitted = eventBus.emittedEvents[0]!;
      expect(emitted.type).toBe('ShootoffShotAdded');
      expect((emitted as any).shootoffId).toBe(shootoffId);
      expect((emitted as any).laneId).toBe('lane-1');
      expect((emitted as any).score).toBe(10.5);
    });

    it('should throw DomainError when shootoff is not found', async () => {
      const command: AddShootoffShotCommand = {
        shootoffId: 'nonexistent',
        laneId: 'lane-1',
        score: 10.0,
      };

      await expect(handler.executeAddShootoffShot(command)).rejects.toThrow(DomainError);
      await expect(handler.executeAddShootoffShot(command)).rejects.toThrow(/Shootoff not found/);
    });

    it('should throw DomainError when lane is not part of the shootoff', async () => {
      const shootoffId = await setupShootoff();

      const command: AddShootoffShotCommand = {
        shootoffId,
        laneId: 'lane-not-in-shootoff',
        score: 10.0,
      };

      await expect(handler.executeAddShootoffShot(command)).rejects.toThrow(DomainError);
      await expect(handler.executeAddShootoffShot(command)).rejects.toThrow(/not part of this shootoff/);
    });

    it('should emit correct roundNumber based on shootoff state', async () => {
      const shootoffId = await setupShootoff();

      // currentRoundNumber is 0 (no rounds added yet), so event roundNumber should be 1
      const command: AddShootoffShotCommand = {
        shootoffId,
        laneId: 'lane-1',
        score: 10.0,
      };

      await handler.executeAddShootoffShot(command);

      const emitted = eventBus.emittedEvents[0]!;
      expect((emitted as any).roundNumber).toBe(1);
    });
  });

  // =========================================================================
  // executeResolveShootoff
  // =========================================================================
  describe('executeResolveShootoff', () => {
    async function setupShootoff(): Promise<string> {
      const lane1 = createPhaseCompleteFinalLane('lane-1', 1, 'p-1');
      const lane2 = createPhaseCompleteFinalLane('lane-2', 2, 'p-2');
      laneStore.set('lane-1', lane1);
      laneStore.set('lane-2', lane2);

      const startCmd: StartShootoffCommand = {
        eventId: 'event-1',
        targetLaneIds: ['lane-1', 'lane-2'],
        contestedRank: 3,
      };
      const { shootoffId } = await handler.executeStartShootoff(startCmd);

      await handler.executeAddShootoffShot({ shootoffId, laneId: 'lane-1', score: 10.5 });
      await handler.executeAddShootoffShot({ shootoffId, laneId: 'lane-2', score: 10.0 });
      await handler.executeCompleteShootoffRound({ shootoffId });

      // Reset event bus tracking
      eventBus.emittedEvents.length = 0;
      vi.mocked(eventBus.emit).mockClear();
      return shootoffId;
    }

    it('should emit ShootoffResolved event with correct data', async () => {
      const shootoffId = await setupShootoff();

      const command: ResolveShootoffCommand = {
        shootoffId,
        rankedLaneIds: ['lane-1', 'lane-2'],
      };

      await handler.executeResolveShootoff(command);

      expect(eventBus.emit).toHaveBeenCalledTimes(1);
      const emitted = eventBus.emittedEvents[0]!;
      expect(emitted.type).toBe('ShootoffResolved');
      expect((emitted as any).shootoffId).toBe(shootoffId);
      expect((emitted as any).rankedLaneIds).toEqual(['lane-1', 'lane-2']);
      expect((emitted as any).contestedRank).toBe(3);
    });

    it('should eliminate losers (non-first-place lanes)', async () => {
      const shootoffId = await setupShootoff();

      // ranked: lane-1 (1st, rank=3), lane-2 (2nd, rank=4)
      const command: ResolveShootoffCommand = {
        shootoffId,
        rankedLaneIds: ['lane-1', 'lane-2'],
      };

      await handler.executeResolveShootoff(command);

      // lane-1 is winner (contestedRank=3), currentRank starts at 3
      // First iteration: currentRank(3) > contestedRank(3) is false => not eliminated, then currentRank becomes 4
      // Second iteration: currentRank(4) > contestedRank(3) is true => lane-2 eliminated at rank 4
      const lane1 = laneStore.get('lane-1');
      const lane2 = laneStore.get('lane-2');
      expect(lane1!.eliminated).toBe(false);
      expect(lane2!.eliminated).toBe(true);
      expect(lane2!.eliminationRank).toBe(4);
    });

    it('should use the resolved scores instead of trusting the caller ranking order', async () => {
      const shootoffId = await setupShootoff();

      await handler.executeResolveShootoff({
        shootoffId,
        rankedLaneIds: ['lane-2', 'lane-1'],
      });

      expect(laneStore.get('lane-1')?.eliminated).toBe(false);
      expect(laneStore.get('lane-2')?.eliminationRank).toBe(4);
      expect(eventBus.emittedEvents[0]).toMatchObject({
        type: 'ShootoffResolved',
        rankedLaneIds: ['lane-1', 'lane-2'],
      });
    });

    it('should return every target lane to SERIES_COMPLETE', async () => {
      const shootoffId = await setupShootoff();

      await handler.executeResolveShootoff({
        shootoffId,
        rankedLaneIds: ['lane-1', 'lane-2'],
      });

      expect(laneStore.get('lane-1')?.phase).toBe('SERIES_COMPLETE');
      expect(laneStore.get('lane-2')?.phase).toBe('SERIES_COMPLETE');
    });

    it.each([
      ['duplicate lanes', ['lane-1', 'lane-1']],
      ['missing lanes', ['lane-1']],
      ['an outside lane', ['lane-1', 'lane-outside']],
    ])('should reject a ranking with %s before changing lane state', async (_caseName, rankedLaneIds) => {
      const shootoffId = await setupShootoff();
      vi.mocked(mockCommandBus.execute).mockClear();

      await expect(handler.executeResolveShootoff({ shootoffId, rankedLaneIds })).rejects.toMatchObject({
        code: 'SHOOTOFF_010',
      });

      expect(laneStore.get('lane-1')?.phase).toBe('SHOOTOFF');
      expect(laneStore.get('lane-2')?.phase).toBe('SHOOTOFF');
      expect(mockCommandBus.execute).not.toHaveBeenCalled();
    });

    it('should validate every target lane before resolving any lane', async () => {
      const shootoffId = await setupShootoff();
      laneStore.set('lane-2', laneStore.get('lane-2')!.resolveShootoff());
      vi.mocked(mockCommandBus.execute).mockClear();

      await expect(handler.executeResolveShootoff({ shootoffId, rankedLaneIds: ['lane-1', 'lane-2'] })).rejects.toThrow(
        /cannot resolve a shoot-off/,
      );

      expect(laneStore.get('lane-1')?.phase).toBe('SHOOTOFF');
      expect(laneStore.get('lane-2')?.phase).toBe('SERIES_COMPLETE');
      expect(mockCommandBus.execute).not.toHaveBeenCalled();
    });

    it('should reject a missing target lane before resolving the remaining lanes', async () => {
      const shootoffId = await setupShootoff();
      laneStore.delete('lane-2');
      vi.mocked(mockCommandBus.execute).mockClear();

      await expect(handler.executeResolveShootoff({ shootoffId, rankedLaneIds: ['lane-1', 'lane-2'] })).rejects.toThrow(
        /Lane not found/,
      );

      expect(laneStore.get('lane-1')?.phase).toBe('SHOOTOFF');
      expect(mockCommandBus.execute).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('should reject resolution until a round determines the ranks', async () => {
      const lane1 = createPhaseCompleteFinalLane('lane-1', 1, 'p-1');
      const lane2 = createPhaseCompleteFinalLane('lane-2', 2, 'p-2');
      laneStore.set('lane-1', lane1);
      laneStore.set('lane-2', lane2);
      const { shootoffId } = await handler.executeStartShootoff({
        eventId: 'event-1',
        targetLaneIds: ['lane-1', 'lane-2'],
        contestedRank: 3,
      });
      vi.mocked(mockCommandBus.execute).mockClear();

      await expect(
        handler.executeResolveShootoff({ shootoffId, rankedLaneIds: ['lane-1', 'lane-2'] }),
      ).rejects.toMatchObject({ code: 'SHOOTOFF_009' });

      expect(laneStore.get('lane-1')?.phase).toBe('SHOOTOFF');
      expect(laneStore.get('lane-2')?.phase).toBe('SHOOTOFF');
      expect(mockCommandBus.execute).not.toHaveBeenCalled();
    });

    it('should cleanup internal mappings after resolution', async () => {
      const shootoffId = await setupShootoff();

      await handler.executeResolveShootoff({
        shootoffId,
        rankedLaneIds: ['lane-1', 'lane-2'],
      });

      // After resolution, adding a shot to the same shootoff should fail
      // because the internal mappings were cleaned up
      const addCmd: AddShootoffShotCommand = {
        shootoffId,
        laneId: 'lane-1',
        score: 10.0,
      };

      // The shootoff still exists in the repo, but the laneToParticipantMap was cleared
      await expect(handler.executeAddShootoffShot(addCmd)).rejects.toThrow(DomainError);
      await expect(handler.executeAddShootoffShot(addCmd)).rejects.toThrow(/mapping not found/);
    });

    it('should throw DomainError when shootoff is not found', async () => {
      const command: ResolveShootoffCommand = {
        shootoffId: 'nonexistent',
        rankedLaneIds: ['lane-1'],
      };

      await expect(handler.executeResolveShootoff(command)).rejects.toThrow(DomainError);
      await expect(handler.executeResolveShootoff(command)).rejects.toThrow(/Shootoff not found/);
    });

    it('should throw DomainError when shootoff mapping is not found', async () => {
      // Manually insert a shootoff into the repo without going through executeStartShootoff
      // so the internal laneToParticipantMap is empty
      const p1 = ParticipantId.create('p-1');
      const p2 = ParticipantId.create('p-2');
      const shootoff = FinalShootoff.create([p1, p2], 3);
      shootoffStore.set(shootoff.id.value, shootoff);

      const command: ResolveShootoffCommand = {
        shootoffId: shootoff.id.value,
        rankedLaneIds: ['lane-1', 'lane-2'],
      };

      await expect(handler.executeResolveShootoff(command)).rejects.toThrow(DomainError);
      await expect(handler.executeResolveShootoff(command)).rejects.toThrow(/mapping not found/);
    });
  });
});

/**
 * Lane Control Module Registration
 *
 * Registers all lane-control-related command handlers, query handlers,
 * IPC handlers, and domain event listeners.
 */
import type { ModuleDefinition, ModuleOutput } from '@/main/shared-infra/module/ModuleDefinition';
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import type { EventTransformer } from '@/main/shared-infra/ipc/EventForwardingRule';
import type { LaneControlIpcPayload } from '@/shared/types/LaneControlIpcPayload';

// Command handlers
import { StartPreparationHandler } from './commands/StartPreparationHandler';
import { AdvanceToNextStageHandler } from './commands/AdvanceToNextStageHandler';
import { StartSeriesHandler } from './commands/StartSeriesHandler';
import { FinishHandler } from './commands/FinishHandler';
import { ClearLanesHandler } from './commands/ClearLanesHandler';
import { AssignPlayersHandler } from './commands/AssignPlayersHandler';
import { MoveLaneHandler } from './commands/MoveLaneHandler';
import { EditShotHandler } from './commands/EditShotHandler';
import { DeleteShotHandler } from './commands/DeleteShotHandler';
import { InsertShotHandler } from './commands/InsertShotHandler';
import { EliminatePlayerHandler } from './commands/EliminatePlayerHandler';
import { RecordShotHandler } from './commands/RecordShotHandler';
import { StartLaneShootoffHandler } from './commands/StartLaneShootoffHandler';
import { AddLaneShootoffShotHandler } from './commands/AddLaneShootoffShotHandler';
import { ResolveLaneShootoffHandler } from './commands/ResolveLaneShootoffHandler';

// Query handlers
import { GetScoreSheetsHandler } from './queries/GetScoreSheetsHandler';
import { GetAllLaneControlsHandler } from './queries/GetAllLaneControlsHandler';
import { GetDebugLogHandler } from './queries/GetDebugLogHandler';
import { GetLaneByIdHandler } from './queries/GetLaneByIdHandler';
import { GetLaneByChannelHandler } from './queries/GetLaneByChannelHandler';
import { GetAllLanesHandler } from './queries/GetAllLanesHandler';

// IPC Contracts
import { laneControlContract, debugContract, eventsContract } from '@/shared/ipc/contracts';

// Domain Entities (for event listeners)
import { LaneControl } from './domain/LaneControl';
import { Channel } from './domain/Channel';
import type { LaneControlUpdated, LaneTimerTick, LaneTimerExpired } from './domain/events';
import { emitLaneControlUpdated } from './commands/helpers/emitLaneControlUpdated';
import { DiffCalculator } from './infra/DiffCalculator';
import { buildRoundConfig } from '@/shared/constants/roundConfig';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';

// Tokens
import {
  StartPreparationToken,
  AdvanceToNextStageToken,
  StartSeriesToken,
  FinishToken,
  ClearToken,
  AssignPlayersToken,
  MoveLaneToken,
  EditShotToken,
  DeleteShotToken,
  InsertShotToken,
  EliminatePlayerToken,
  RecordShotToken,
  StartLaneShootoffToken,
  AddLaneShootoffShotToken,
  ResolveLaneShootoffToken,
  GetAllLaneControlsToken,
  GetScoreSheetsToken,
  GetDebugLogToken,
  GetLaneByIdToken,
  GetLaneByChannelToken,
  GetAllLanesToken,
} from './tokens';

const MAX_SEQ = 0xffffffff;

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
      participantId: event.participantId,
      relayNumber: event.relayNumber,
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

const DEFAULT_QUALIFICATION_CONFIG = buildRoundConfig(BR60S);

export const laneControlModule: ModuleDefinition<
  | 'laneControlRepository'
  | 'eventBus'
  | 'commandBus'
  | 'queryBus'
  | 'competitionTypeRegistry'
  | 'debugLogStore'
  | 'ipcRouter'
  | 'laneTimerService'
  | 'participantEligibilityReader'
> = {
  name: 'lane-control',
  deps: [
    'laneControlRepository',
    'eventBus',
    'commandBus',
    'queryBus',
    'competitionTypeRegistry',
    'debugLogStore',
    'ipcRouter',
    'laneTimerService',
    'participantEligibilityReader',
  ] as const,
  register(ctx): ModuleOutput {
    const {
      laneControlRepository,
      eventBus,
      commandBus,
      queryBus,
      competitionTypeRegistry,
      debugLogStore,
      ipcRouter,
      laneTimerService,
      participantEligibilityReader,
    } = ctx;

    // === Command Handlers ===
    const startPrep = new StartPreparationHandler(laneControlRepository, eventBus);
    const advanceStage = new AdvanceToNextStageHandler(laneControlRepository, eventBus);
    const startSeries = new StartSeriesHandler(laneControlRepository, eventBus);
    const finish = new FinishHandler(laneControlRepository, eventBus);
    const clear = new ClearLanesHandler(laneControlRepository, eventBus);
    const assignPlayers = new AssignPlayersHandler(
      laneControlRepository,
      eventBus,
      competitionTypeRegistry,
      participantEligibilityReader,
    );
    const moveLane = new MoveLaneHandler(laneControlRepository, eventBus);
    const editShot = new EditShotHandler(laneControlRepository, eventBus);
    const deleteShot = new DeleteShotHandler(laneControlRepository, eventBus);
    const insertShot = new InsertShotHandler(laneControlRepository, eventBus);
    const eliminatePlayer = new EliminatePlayerHandler(laneControlRepository, eventBus);
    const recordShot = new RecordShotHandler(laneControlRepository, eventBus);
    const startLaneShootoff = new StartLaneShootoffHandler(laneControlRepository, eventBus);
    const addLaneShootoffShot = new AddLaneShootoffShotHandler(laneControlRepository, eventBus);
    const resolveLaneShootoff = new ResolveLaneShootoffHandler(laneControlRepository, eventBus);

    commandBus.register(StartPreparationToken, (input) => startPrep.execute(input));
    commandBus.register(AdvanceToNextStageToken, (input) => advanceStage.execute(input));
    commandBus.register(StartSeriesToken, (input) => startSeries.execute(input));
    commandBus.register(FinishToken, (input) => finish.execute(input));
    commandBus.register(ClearToken, (input) => clear.execute(input));
    commandBus.register(AssignPlayersToken, (input) => assignPlayers.execute(input));
    commandBus.register(MoveLaneToken, (input) => moveLane.execute(input));
    commandBus.register(EditShotToken, (input) => editShot.execute(input));
    commandBus.register(DeleteShotToken, (input) => deleteShot.execute(input));
    commandBus.register(InsertShotToken, (input) => insertShot.execute(input));
    commandBus.register(EliminatePlayerToken, (input) => eliminatePlayer.execute(input));
    commandBus.register(RecordShotToken, (input) => recordShot.execute(input));
    commandBus.register(StartLaneShootoffToken, (input) => startLaneShootoff.execute(input));
    commandBus.register(AddLaneShootoffShotToken, (input) => addLaneShootoffShot.execute(input));
    commandBus.register(ResolveLaneShootoffToken, (input) => resolveLaneShootoff.execute(input));

    // === Query Handlers ===
    const getScoreSheets = new GetScoreSheetsHandler(laneControlRepository);
    const getAllLaneControls = new GetAllLaneControlsHandler(laneControlRepository);
    const getDebugLog = new GetDebugLogHandler(debugLogStore);
    const getLaneById = new GetLaneByIdHandler(laneControlRepository);
    const getLaneByChannel = new GetLaneByChannelHandler(laneControlRepository);
    const getAllLanes = new GetAllLanesHandler(laneControlRepository);

    queryBus.register(GetScoreSheetsToken, async (input) => getScoreSheets.execute(input));
    queryBus.register(GetAllLaneControlsToken, async () => getAllLaneControls.execute());
    queryBus.register(GetDebugLogToken, async () => getDebugLog.execute());
    queryBus.register(GetLaneByIdToken, async (input) => getLaneById.execute(input));
    queryBus.register(GetLaneByChannelToken, async (input) => getLaneByChannel.execute(input));
    queryBus.register(GetAllLanesToken, async () => getAllLanes.execute());

    // === IPC Registration: Lane Control ===
    ipcRouter.register(laneControlContract, {
      getAll: () => queryBus.execute(GetAllLaneControlsToken, {}),
      startPreparation: (input) => commandBus.execute(StartPreparationToken, input),
      advanceStage: (input) => commandBus.execute(AdvanceToNextStageToken, input),
      startSeries: (input) => commandBus.execute(StartSeriesToken, input),
      finish: (input) => commandBus.execute(FinishToken, input),
      clear: (input) => commandBus.execute(ClearToken, input),
      assignPlayers: (input) => commandBus.execute(AssignPlayersToken, input),
      moveLane: (input) => commandBus.execute(MoveLaneToken, input),
      editShot: (input) => commandBus.execute(EditShotToken, input),
      deleteShot: (input) => commandBus.execute(DeleteShotToken, input),
      insertShot: (input) => commandBus.execute(InsertShotToken, input),
      eliminate: (input) => commandBus.execute(EliminatePlayerToken, input),
      getScoreSheets: (input) => queryBus.execute(GetScoreSheetsToken, input),
    });

    // === IPC Registration: Debug ===
    ipcRouter.register(debugContract, {
      getDebugLog: () => queryBus.execute(GetDebugLogToken, {}),
    });

    // === Domain Event Listeners ===

    eventBus.on('LanePhaseChanged', (event) => {
      if (event.phase === 'ACTIVE') {
        laneTimerService.startTimer(event.laneId);
      }
    });

    eventBus.on('LaneMoved', (event) => {
      laneTimerService.stopTimer(event.fromLaneId);
      const targetLane = laneControlRepository.findById(event.toLaneId);
      if (targetLane && targetLane.phase === 'ACTIVE') {
        laneTimerService.startTimer(event.toLaneId);
      }
    });

    eventBus.on('LaneConnected', (event) => {
      const existingById = laneControlRepository.findById(event.laneId);
      if (existingById) {
        if (existingById.channel.value === event.channel) return;
        const occupied = laneControlRepository.findByChannel(event.channel);
        if (occupied && occupied.id !== event.laneId) return;
        const moved = LaneControl.fromSnapshot({ ...existingById.toSnapshot(), channel: event.channel });
        laneControlRepository.save(moved);
        emitLaneControlUpdated(eventBus, moved);
        return;
      }

      const existingByChannel = laneControlRepository.findByChannel(event.channel);
      if (existingByChannel) return;
      const channel = Channel.create(event.channel);
      const lane = LaneControl.create(event.laneId, channel, DEFAULT_QUALIFICATION_CONFIG);
      laneControlRepository.save(lane);
      emitLaneControlUpdated(eventBus, lane);
    });

    return {
      eventForwarding: [
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
      ],
    };
  },
};

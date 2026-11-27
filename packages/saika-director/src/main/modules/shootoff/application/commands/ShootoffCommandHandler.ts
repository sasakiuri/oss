import type {
  StartShootoffCommand,
  AddShootoffShotCommand,
  CompleteShootoffRoundCommand,
  CompleteShootoffRoundResult,
  ResolveShootoffCommand,
} from './ShootoffCommands';
import type { IShootoffRepository } from '../../domain/IShootoffRepository';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import {
  Score,
  GetLaneByIdToken,
  StartLaneShootoffToken,
  AddLaneShootoffShotToken,
  ResolveLaneShootoffToken,
  EliminatePlayerToken,
} from '@/main/modules/lane-control';
import { FinalShootoff, type ShootoffShot } from '../../domain/FinalShootoff';
import { ParticipantId } from '@/main/modules/championship';
import { DomainError, ErrorCatalog } from '@/shared/errors';

export class ShootoffCommandHandler {
  /** The participant on each Lane of every running shoot-off. */
  private readonly participantsByShootoff = new Map<string, Map<string, ParticipantId>>();

  constructor(
    private readonly shootoffRepository: IShootoffRepository,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly eventBus: IEventBus,
  ) {}

  async executeStartShootoff(command: StartShootoffCommand): Promise<{ shootoffId: string }> {
    const laneToParticipant = new Map<string, ParticipantId>();
    const participantIds: ParticipantId[] = [];

    for (const laneId of command.targetLaneIds) {
      const laneControl = await this.queryBus.execute(GetLaneByIdToken, { laneId });
      if (!laneControl) {
        throw new DomainError(ErrorCatalog.COMPETITION.LANE_NOT_FOUND, {
          messageOverride: `Lane not found: ${laneId}`,
        });
      }

      if (!laneControl.player?.participantId) {
        throw new DomainError(ErrorCatalog.LANE.SOURCE_NO_PLAYER, {
          messageOverride: `Lane ${laneId} has no player assigned`,
        });
      }

      if (laneControl.phase !== 'SERIES_COMPLETE') {
        throw new DomainError(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION, {
          messageOverride: `Lane ${laneId} cannot start a shoot-off from phase ${laneControl.phase}`,
        });
      }

      const participantId = ParticipantId.create(laneControl.player.participantId);
      laneToParticipant.set(laneId, participantId);
      participantIds.push(participantId);
    }

    const shootoff = FinalShootoff.create(participantIds, command.contestedRank);
    const shootoffId = shootoff.id.value;

    for (const laneId of command.targetLaneIds) {
      await this.commandBus.execute(StartLaneShootoffToken, { laneId });
    }

    this.shootoffRepository.saveWithEventId(shootoff, command.eventId);
    this.participantsByShootoff.set(shootoffId, laneToParticipant);

    this.eventBus.emit({
      type: 'ShootoffStarted',
      timestamp: Date.now(),
      shootoffId,
      eventId: command.eventId,
      targetLaneIds: command.targetLaneIds,
      contestedRank: command.contestedRank,
    });

    return { shootoffId };
  }

  async executeAddShootoffShot(command: AddShootoffShotCommand): Promise<void> {
    const { shootoff, laneToParticipant } = this.requireShootoff(command.shootoffId);

    const participantId = laneToParticipant.get(command.laneId);
    if (!participantId) {
      throw new DomainError(ErrorCatalog.COMPETITION.LANE_NOT_FOUND, {
        messageOverride: `Lane ${command.laneId} is not part of this shootoff`,
      });
    }

    await this.commandBus.execute(AddLaneShootoffShotToken, { laneId: command.laneId, score: command.score });

    this.eventBus.emit({
      type: 'ShootoffShotAdded',
      timestamp: Date.now(),
      shootoffId: command.shootoffId,
      laneId: command.laneId,
      roundNumber: shootoff.currentRoundNumber + 1,
      score: command.score,
    });
  }

  async executeCompleteShootoffRound(command: CompleteShootoffRoundCommand): Promise<CompleteShootoffRoundResult> {
    const { shootoff, laneToParticipant } = this.requireShootoff(command.shootoffId);

    const shots: ShootoffShot[] = [];
    const nextRoundNumber = shootoff.currentRoundNumber + 1;

    for (const [laneId, participantId] of laneToParticipant) {
      const laneControl = await this.queryBus.execute(GetLaneByIdToken, { laneId });
      if (!laneControl) {
        throw new DomainError(ErrorCatalog.COMPETITION.LANE_NOT_FOUND, {
          messageOverride: `Lane not found: ${laneId}`,
        });
      }

      const shootoffShots = laneControl.shootoffShots;
      const currentRoundShot = shootoffShots[nextRoundNumber - 1];

      if (!currentRoundShot) {
        throw new DomainError(ErrorCatalog.SHOOTOFF.INCOMPLETE_ROUND, {
          messageOverride: `Lane ${laneId} has not shot for round ${nextRoundNumber}`,
        });
      }

      shots.push({
        participantId,
        roundNumber: nextRoundNumber,
        score: Score.create(currentRoundShot.score.value),
      });
    }

    const shootoffWithRound = shootoff.addRound(shots);

    const resolvedShootoff = shootoffWithRound.resolveRanks();

    this.shootoffRepository.save(resolvedShootoff);

    const result: CompleteShootoffRoundResult = {
      isResolved: resolvedShootoff.isResolved,
      needsNextRound: !resolvedShootoff.isResolved,
      currentRound: resolvedShootoff.currentRoundNumber,
    };

    if (resolvedShootoff.isResolved) {
      const participantToLane = new Map(
        [...laneToParticipant].map(([laneId, participantId]) => [participantId.value, laneId]),
      );
      const winner = resolvedShootoff.getWinner();
      if (winner) {
        result.winnerLaneId = participantToLane.get(winner.value);
      }

      const loserLaneIds: string[] = [];
      for (const participantId of resolvedShootoff.targetParticipantIds) {
        if (!winner || !participantId.equals(winner)) {
          const laneId = participantToLane.get(participantId.value);
          if (laneId) {
            loserLaneIds.push(laneId);
          }
        }
      }
      result.loserLaneIds = loserLaneIds;
    }

    this.eventBus.emit({
      type: 'ShootoffRoundCompleted',
      timestamp: Date.now(),
      shootoffId: command.shootoffId,
      roundNumber: resolvedShootoff.currentRoundNumber,
      isResolved: result.isResolved,
      winnerLaneId: result.winnerLaneId,
      loserLaneIds: result.loserLaneIds,
    });

    return result;
  }

  async executeResolveShootoff(command: ResolveShootoffCommand): Promise<void> {
    const { shootoff, laneToParticipant } = this.requireShootoff(command.shootoffId);

    if (!shootoff.isResolved || !shootoff.resolvedRanks) {
      throw DomainError.from(ErrorCatalog.SHOOTOFF.NOT_RESOLVED);
    }

    const rankedLaneIds = new Set(command.rankedLaneIds);
    const hasEveryTargetLane = [...laneToParticipant.keys()].every((laneId) => rankedLaneIds.has(laneId));
    if (
      rankedLaneIds.size !== command.rankedLaneIds.length ||
      rankedLaneIds.size !== laneToParticipant.size ||
      !hasEveryTargetLane
    ) {
      throw DomainError.from(ErrorCatalog.SHOOTOFF.INVALID_RANKING);
    }

    const rankedLanes: Array<{ laneId: string; rank: number }> = [];

    for (const laneId of command.rankedLaneIds) {
      const laneControl = await this.queryBus.execute(GetLaneByIdToken, { laneId });
      if (!laneControl) {
        throw new DomainError(ErrorCatalog.COMPETITION.LANE_NOT_FOUND, {
          messageOverride: `Lane not found: ${laneId}`,
        });
      }

      if (laneControl.phase !== 'SHOOTOFF') {
        throw new DomainError(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION, {
          messageOverride: `Lane ${laneId} cannot resolve a shoot-off from phase ${laneControl.phase}`,
        });
      }

      const participantId = laneToParticipant.get(laneId);
      if (!participantId || laneControl.player?.participantId !== participantId.value) {
        throw DomainError.from(ErrorCatalog.SHOOTOFF.INVALID_RANKING);
      }

      const rank = shootoff.resolvedRanks.get(participantId.value);
      if (rank === undefined) {
        throw DomainError.from(ErrorCatalog.SHOOTOFF.INVALID_RANKING);
      }
      rankedLanes.push({ laneId, rank });
    }

    rankedLanes.sort((left, right) => left.rank - right.rank);

    for (const { laneId } of rankedLanes) {
      await this.commandBus.execute(ResolveLaneShootoffToken, { laneId });
    }

    for (const { laneId, rank } of rankedLanes) {
      if (rank > shootoff.contestedRank) {
        await this.commandBus.execute(EliminatePlayerToken, { laneId, rank });
      }
    }

    this.eventBus.emit({
      type: 'ShootoffResolved',
      timestamp: Date.now(),
      shootoffId: command.shootoffId,
      rankedLaneIds: rankedLanes.map(({ laneId }) => laneId),
      contestedRank: shootoff.contestedRank,
    });

    this.participantsByShootoff.delete(command.shootoffId);
  }

  private requireShootoff(shootoffId: string): {
    shootoff: FinalShootoff;
    laneToParticipant: Map<string, ParticipantId>;
  } {
    const shootoff = this.shootoffRepository.findById(shootoffId);
    if (!shootoff) {
      throw new DomainError(ErrorCatalog.DATA.NOT_FOUND, {
        messageOverride: `Shootoff not found: ${shootoffId}`,
      });
    }

    const laneToParticipant = this.participantsByShootoff.get(shootoffId);
    if (!laneToParticipant) {
      throw new DomainError(ErrorCatalog.DATA.NOT_FOUND, {
        messageOverride: `Shootoff mapping not found: ${shootoffId}`,
      });
    }
    return { shootoff, laneToParticipant };
  }
}

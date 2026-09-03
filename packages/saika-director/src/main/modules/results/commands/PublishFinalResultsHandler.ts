import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { type LaneControl, GetLaneByIdToken } from '@/main/modules/lane-control';
import type { IFinalResultRepository } from '../domain/IFinalResultRepository';
import { GetEventByIdToken } from '@/main/modules/championship';
import { FinalResult } from '../domain/FinalResult';
import { FinalResultId } from '../domain/FinalResultId';
import { EventId, ParticipantId } from '@/main/modules/championship';
import type { PublishFinalResultsCommand } from './PublishFinalResults';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { GetEventByIdResponse } from '@/main/modules/championship';
import { Logger } from '@/shared/utils/Logger';

export interface PublishFinalResultsResponse {
  savedCount: number;
  errors: string[];
}

const logger = Logger.create('PublishFinalResultsHandler');

export class PublishFinalResultsHandler {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly finalResultRepository: IFinalResultRepository,
    private readonly competitionTypeRegistry: CompetitionTypeRegistry,
  ) {}

  async execute(command: PublishFinalResultsCommand): Promise<PublishFinalResultsResponse> {
    const endTimer = logger.startTimer('PublishFinalResults');
    logger.info('PublishFinalResults executed', { eventId: command.eventId, laneIds: command.laneIds });
    const errors: string[] = [];

    try {
      if (command.laneIds.length === 0) {
        return { savedCount: 0, errors: ['At least one Lane is required to publish final results'] };
      }
      if (new Set(command.laneIds).size !== command.laneIds.length) {
        return { savedCount: 0, errors: ['Final result Lane IDs must be unique'] };
      }

      // Resolve competition type from event's eventType
      const event = (await this.queryBus.execute(GetEventByIdToken, {
        eventId: command.eventId,
      })) as GetEventByIdResponse | null;
      if (!event) {
        return { savedCount: 0, errors: [`Event ${command.eventId} not found`] };
      }
      const def = this.competitionTypeRegistry.get(event.eventType);
      const strategy = this.competitionTypeRegistry.getStrategyFor(def);
      const format = def.resultFormat;
      const stage1ShotCount = format.stage1Shots ?? 0;

      const laneDataList: Array<{
        laneId: string;
        laneControl: LaneControl;
        matchShots: number[];
        stage1Shots: number[];
        stage2Shots: number[];
      }> = [];
      const laneIdByParticipantId = new Map<string, string>();

      for (const laneId of command.laneIds) {
        const laneControl = (await this.queryBus.execute(GetLaneByIdToken, { laneId })) as LaneControl | undefined;

        if (!laneControl) {
          errors.push(`Lane ${laneId} not found`);
          continue;
        }

        if (laneControl.config.roundType !== 'Final') {
          errors.push(`Lane ${laneId} is not a Final round`);
          continue;
        }

        if (!laneControl.player) {
          errors.push(`Lane ${laneId} has no player assigned`);
          continue;
        }

        if (!laneControl.player.participantId) {
          errors.push(`Lane ${laneId} player has no participantId`);
          continue;
        }

        const previousLaneId = laneIdByParticipantId.get(laneControl.player.participantId);
        if (previousLaneId) {
          errors.push(
            `Participant ${laneControl.player.participantId} is assigned to multiple Lanes: ${previousLaneId} and ${laneId}`,
          );
          continue;
        }
        laneIdByParticipantId.set(laneControl.player.participantId, laneId);

        const matchShots = laneControl.matchShots.map((shot) => shot.score.value);
        const { stage1Shots, stage2Shots } = strategy.splitFinalStages(matchShots, format);
        laneDataList.push({
          laneId,
          laneControl,
          matchShots,
          stage1Shots,
          stage2Shots,
        });
      }

      // Final results replace the complete event result set. Never delete the
      // previous set when even one requested Lane cannot be represented.
      if (errors.length > 0) return { savedCount: 0, errors };

      const nonEliminatedPlayers = laneDataList
        .filter((d) => !d.laneControl.eliminated)
        .sort((a, b) => b.laneControl.displayTotalScore - a.laneControl.displayTotalScore);

      const rankMap = new Map<string, number>();
      nonEliminatedPlayers.forEach((data, index) => {
        rankMap.set(data.laneId, index + 1);
      });

      laneDataList
        .filter((d) => d.laneControl.eliminated)
        .forEach((data) => {
          rankMap.set(data.laneId, data.laneControl.eliminationRank ?? 0);
        });

      const resultsToSave: FinalResult[] = [];
      for (const data of laneDataList) {
        try {
          const { laneControl, stage1Shots, stage2Shots } = data;
          const eliminated = laneControl.eliminated;
          const finalRank = rankMap.get(data.laneId) ?? 0;
          const eliminatedAtShot =
            eliminated && laneControl.eliminationRank ? stage1ShotCount + stage2Shots.length : undefined;

          const result = FinalResult.reconstruct(
            FinalResultId.generate(),
            EventId.create(command.eventId),
            ParticipantId.create(laneControl.player!.participantId!),
            laneControl.player!.name,
            laneControl.player!.affiliation,
            laneControl.channel.value,
            stage1Shots,
            sum(stage1Shots),
            stage2Shots,
            sum(stage2Shots),
            laneControl.displayTotalScore,
            finalRank,
            eliminatedAtShot,
            undefined, // shootoffId
            '', // remarks
            eliminated ? 'eliminated' : laneControl.phase === 'FINISHED' ? 'finished' : 'in_progress',
          );

          resultsToSave.push(result);
        } catch (error) {
          logger.error(`Error building final result for lane ${data.laneId}:`, error);
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to build final result for lane ${data.laneId}: ${message}`);
        }
      }

      if (errors.length > 0) return { savedCount: 0, errors };

      let savedCount = 0;
      this.finalResultRepository.executeInTransaction(() => {
        this.finalResultRepository.deleteByEventId(command.eventId);

        for (const result of resultsToSave) {
          this.finalResultRepository.save(result);
          savedCount++;
          logger.debug(`Final result saved`, {
            participantId: result.participantId.value,
            playerName: result.playerName,
            totalScore: result.totalScore,
            rank: result.finalRank,
          });
        }
      });

      logger.debug('PublishFinalResults completed', { savedCount, errorCount: errors.length });
      return { savedCount, errors };
    } finally {
      endTimer();
    }
  }
}

function sum(scores: readonly number[]): number {
  return Math.round(scores.reduce((total, score) => total + score, 0) * 10) / 10;
}

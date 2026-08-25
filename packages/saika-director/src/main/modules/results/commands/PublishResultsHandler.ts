import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { type LaneControl, GetLaneByIdToken } from '@/main/modules/lane-control';
import type { IResultRepository } from '../domain/IResultRepository';
import { GetEventByIdToken } from '@/main/modules/championship';
import { Result } from '../domain/Result';
import { ResultId } from '../domain/ResultId';
import { EventId, ParticipantId } from '@/main/modules/championship';
import type { PublishResultsCommand } from './PublishResults';
import type { PublishResultsResponse } from '@/shared/ipc/contracts/results.contract';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { GetEventByIdResponse } from '@/main/modules/championship';
import { Logger } from '@/shared/utils/Logger';

export type { PublishResultsResponse };

const logger = Logger.create('PublishResultsHandler');

export class PublishResultsHandler {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly resultRepository: IResultRepository,
    private readonly competitionTypeRegistry: CompetitionTypeRegistry,
  ) {}

  async execute(command: PublishResultsCommand): Promise<PublishResultsResponse> {
    const endTimer = logger.startTimer('PublishResults');
    logger.info('PublishResults executed', { eventId: command.eventId, laneIds: command.laneIds });
    logger.debug('Starting with command:', JSON.stringify(command));

    // Resolve competition type from event's eventType
    const event = (await this.queryBus.execute(GetEventByIdToken, {
      eventId: command.eventId,
    })) as GetEventByIdResponse | null;
    if (!event) {
      endTimer();
      return { savedCount: 0, errors: [`Event ${command.eventId} not found`] };
    }
    const def = this.competitionTypeRegistry.get(event.eventType);
    const strategy = this.competitionTypeRegistry.getStrategyFor(def);
    const format = def.resultFormat;

    const errors: string[] = [];
    let savedCount = 0;

    try {
      for (const laneId of command.laneIds) {
        logger.debug(`Processing lane: ${laneId}`);
        const laneControl = (await this.queryBus.execute(GetLaneByIdToken, { laneId })) as LaneControl | undefined;

        if (!laneControl) {
          logger.debug(`Lane ${laneId} not found`);
          errors.push(`Lane ${laneId} not found`);
          continue;
        }

        logger.debug(`Lane ${laneId} found, player:`, laneControl.player);

        if (!laneControl.player) {
          logger.debug(`Lane ${laneId} has no player assigned`);
          errors.push(`Lane ${laneId} has no player assigned`);
          continue;
        }

        if (!laneControl.player.participantId) {
          logger.debug(`Lane ${laneId} player has no participantId`);
          errors.push(`Lane ${laneId} player has no participantId`);
          continue;
        }

        logger.debug(`Lane ${laneId} has participantId:`, laneControl.player.participantId);

        const existingResult = this.resultRepository.findByParticipantId(laneControl.player.participantId);
        if (
          existingResult &&
          (existingResult.eventId.value !== command.eventId || existingResult.relayNumber !== laneControl.relayNumber)
        ) {
          errors.push(
            `Participant ${laneControl.player.participantId} already has a result in event ${existingResult.eventId.value}, relay ${existingResult.relayNumber}`,
          );
          continue;
        }
        if (existingResult && existingResult.sourceCompetitionId !== null) {
          errors.push(
            `Participant ${laneControl.player.participantId} has a result owned by MQTT competition ${existingResult.sourceCompetitionId}`,
          );
          continue;
        }
        if (existingResult?.status === 'confirmed') {
          errors.push(`Participant ${laneControl.player.participantId} already has a confirmed result`);
          continue;
        }

        // Extract shot scores from matchShots and pad via strategy
        const shotScores = laneControl.matchShots.map((shot) => shot.score.value);
        const paddedShots = strategy.padShots(shotScores, format);

        // Pad seriesScores via strategy
        const paddedSeries = strategy.padSeries([...laneControl.seriesScores], format);

        try {
          const result = Result.create(
            ResultId.generate(),
            EventId.create(command.eventId),
            ParticipantId.create(laneControl.player.participantId),
            laneControl.player.name,
            laneControl.player.affiliation,
            laneControl.totalScore,
            paddedSeries,
            paddedShots,
            laneControl.relayNumber,
            'published',
            format,
          );

          this.resultRepository.save(result);
          savedCount++;
          logger.debug(`Result saved for lane ${laneId}`, {
            playerName: laneControl.player.name,
            totalScore: laneControl.totalScore,
          });
        } catch (error) {
          logger.error(`Error saving result for lane ${laneId}:`, error);
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to save result for lane ${laneId}: ${message}`);
        }
      }

      logger.debug('PublishResults completed', { savedCount, errorCount: errors.length });
      return { savedCount, errors };
    } finally {
      endTimer();
    }
  }
}

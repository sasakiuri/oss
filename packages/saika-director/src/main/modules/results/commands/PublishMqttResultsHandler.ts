// SPDX-License-Identifier: MIT
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import {
  EventId,
  GetEventByIdToken,
  GetFiringPointAssignmentsByRelayToken,
  ParticipantId,
  type GetEventByIdResponse,
} from '@/main/modules/championship';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { PublishResultsResponse } from '@/shared/ipc/contracts/results.contract';
import type { CompetitionShotPayload, LaneScorePayload } from '@/shared/mqtt';
import type { CompetitionShotObservation, ICompetitionShotJournal } from '@/main/modules/mqtt';

import type { IResultRepository } from '../domain/IResultRepository';
import { Result } from '../domain/Result';
import { ResultId } from '../domain/ResultId';
import type { PublishMqttResultsCommand, PublishMqttResultLane } from './PublishMqttResults';
import {
  assembleRankingEvidence,
  type RankingSeriesEvidenceInput,
  type RankingShotSourceEvidence,
} from '../domain/RankingEvidenceAssembler';

function scoreFromX10(value: number): number {
  return value / 10;
}

function seriesScores(lane: PublishMqttResultLane): number[] {
  return (lane.score?.stages ?? [])
    .slice()
    .sort((a, b) => a.stageIndex - b.stageIndex)
    .flatMap((stage) =>
      stage.series
        .slice()
        .sort((a, b) => a.seriesIndex - b.seriesIndex)
        .map((series) => scoreFromX10(series.seriesTotalX10)),
    );
}

function shotScores(score: NonNullable<PublishMqttResultLane['score']>): number[] {
  return score.stages
    .slice()
    .sort((a, b) => a.stageIndex - b.stageIndex)
    .flatMap((stage) =>
      stage.series
        .slice()
        .sort((a, b) => a.seriesIndex - b.seriesIndex)
        .flatMap((series) => series.shots.map(scoreFromX10)),
    );
}

function rankingSeries(score: LaneScorePayload): RankingSeriesEvidenceInput[] {
  return score.stages.flatMap((stage) =>
    stage.series.map((series) => ({
      stageIndex: stage.stageIndex,
      seriesIndex: series.seriesIndex,
      scoresX10: series.shots,
    })),
  );
}

function journalEvidence(observation: CompetitionShotObservation): RankingShotSourceEvidence {
  return {
    shotId: observation.shotId,
    stageIndex: observation.stageIndex,
    seriesIndex: observation.seriesIndex,
    shotNumberInSeries: observation.shotNumberInSeries,
    effectiveScoreX10: observation.effectiveScoreX10,
    deviceScoreX10: observation.deviceScoreX10,
    calculatedScoreX10: observation.calculatedScoreX10,
    calculatedScoreAvailable: observation.calculatedScoreAvailable,
    innerTen: observation.innerTen,
  };
}

function payloadEvidence(shot: CompetitionShotPayload): RankingShotSourceEvidence {
  return {
    shotId: shot.shotId,
    stageIndex: shot.stageIndex,
    seriesIndex: shot.seriesIndex,
    shotNumberInSeries: shot.shotNumberInSeries,
    effectiveScoreX10: shot.effectiveScoreX10 ?? shot.rawScoreX10,
    deviceScoreX10: shot.deviceScoreX10 ?? null,
    calculatedScoreX10: shot.calculatedScoreX10 ?? shot.rawScoreX10,
    calculatedScoreAvailable: shot.calculatedScoreX10 !== undefined,
    innerTen: shot.innerTen,
  };
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasSameResultData(existing: Result, candidate: Result): boolean {
  return (
    existing.eventId.value === candidate.eventId.value &&
    existing.participantId.value === candidate.participantId.value &&
    existing.playerName === candidate.playerName &&
    existing.affiliation === candidate.affiliation &&
    existing.totalScore === candidate.totalScore &&
    existing.relayNumber === candidate.relayNumber &&
    sameNumbers(existing.seriesScores, candidate.seriesScores) &&
    sameNumbers(existing.shots, candidate.shots)
  );
}

export class PublishMqttResultsHandler {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly resultRepository: IResultRepository,
    private readonly competitionTypeRegistry: CompetitionTypeRegistry,
    private readonly shotJournal?: ICompetitionShotJournal,
  ) {}

  async execute(command: PublishMqttResultsCommand): Promise<PublishResultsResponse> {
    const event = (await this.queryBus.execute(GetEventByIdToken, {
      eventId: command.eventId,
    })) as GetEventByIdResponse | null;
    if (!event) {
      return { savedCount: 0, errors: [`Event ${command.eventId} not found`] };
    }
    if (event.eventType !== command.competitionTypeId) {
      return {
        savedCount: 0,
        errors: [
          `Event ${command.eventId} uses competition type ${event.eventType}, but competition ${command.competitionId} uses ${command.competitionTypeId}`,
        ],
      };
    }
    if (command.lanes.length === 0) {
      return {
        savedCount: 0,
        errors: [`Competition ${command.competitionId} has no Lane result data`],
      };
    }

    const relayAssignments = await this.queryBus.execute(GetFiringPointAssignmentsByRelayToken, {
      eventId: command.eventId,
      relayNumber: command.relayNumber,
    });
    if (relayAssignments.length === 0) {
      return {
        savedCount: 0,
        errors: [`Event ${command.eventId} relay ${command.relayNumber} has no firing-point assignments`],
      };
    }
    const relayAssignmentsByParticipantId = new Map(
      relayAssignments.map((assignment) => [assignment.participantId, assignment]),
    );

    const definition = this.competitionTypeRegistry.get(event.eventType);
    const strategy = this.competitionTypeRegistry.getStrategyFor(definition);
    const expectedAcc = definition.scoring.precision === 0 ? 'RING' : 'DECIMAL';
    const errors: string[] = [];
    const results: Result[] = [];
    const laneIdByParticipantId = new Map<string, string>();
    const existingCompetitionResults = this.resultRepository.findByCompetitionId(
      command.eventId,
      command.relayNumber,
      command.competitionId,
    );
    let journalObservations: CompetitionShotObservation[] = [];
    try {
      journalObservations = this.shotJournal?.findByCompetition(command.competitionId) ?? [];
    } catch {
      // Ranking evidence is additive. The retained score snapshot can still be
      // published, and direct MQTT shot payloads below provide a fallback.
    }

    for (const lane of command.lanes) {
      const athlete = lane.assignment?.competitionId === command.competitionId ? lane.assignment.athlete : null;
      const score = lane.score?.competitionId === command.competitionId ? lane.score : null;
      if (!athlete) {
        errors.push(`Lane ${lane.laneId} has no tournament athlete assigned`);
        continue;
      }
      if (!score) {
        errors.push(`Lane ${lane.laneId} has no score for competition ${command.competitionId}`);
        continue;
      }
      if (score.acc !== expectedAcc) {
        errors.push(
          `Lane ${lane.laneId} uses ${score.acc} scoring, but competition type ${definition.id} requires ${expectedAcc}`,
        );
        continue;
      }
      const relayAssignment = relayAssignmentsByParticipantId.get(athlete.id);
      if (!relayAssignment) {
        errors.push(
          `Participant ${athlete.id} on Lane ${lane.laneId} is not assigned to relay ${command.relayNumber} of event ${command.eventId}`,
        );
        continue;
      }
      const previousLaneId = laneIdByParticipantId.get(athlete.id);
      if (previousLaneId !== undefined) {
        errors.push(`Participant ${athlete.id} is assigned to multiple Lanes: ${previousLaneId} and ${lane.laneId}`);
        continue;
      }
      laneIdByParticipantId.set(athlete.id, lane.laneId);

      try {
        const sources = [
          ...journalObservations
            .filter(
              (observation) =>
                observation.laneId === lane.laneId &&
                observation.sessionId === score.sessionId &&
                observation.mode === 'MATCH' &&
                observation.scored &&
                observation.isRecorded,
            )
            .map(journalEvidence),
          ...lane.shots
            .filter(
              (shot) =>
                shot.competitionId === command.competitionId &&
                shot.laneId === lane.laneId &&
                shot.sessionId === score.sessionId &&
                shot.mode === 'MATCH' &&
                shot.scored &&
                shot.isRecorded,
            )
            .map(payloadEvidence),
        ];
        const rankingEvidence = assembleRankingEvidence(rankingSeries(score), sources);
        const candidate = Result.create(
          ResultId.generate(),
          EventId.create(command.eventId),
          ParticipantId.create(athlete.id),
          relayAssignment.playerName,
          relayAssignment.affiliation,
          scoreFromX10(score.totalScoreX10),
          strategy.padSeries(seriesScores(lane), definition.resultFormat),
          strategy.padShots(shotScores(score), definition.resultFormat),
          command.relayNumber,
          'published',
          definition.resultFormat,
          command.competitionId,
          relayAssignment.familyName,
          lane.laneId,
          rankingEvidence,
        );
        const existingResult = this.resultRepository.findByParticipantId(athlete.id);
        if (
          existingResult &&
          (existingResult.eventId.value !== command.eventId || existingResult.relayNumber !== command.relayNumber)
        ) {
          errors.push(
            `Participant ${athlete.id} already has a result in event ${existingResult.eventId.value}, relay ${existingResult.relayNumber}`,
          );
          continue;
        }
        if (existingResult?.status === 'confirmed') {
          if (
            existingResult.sourceCompetitionId !== null &&
            existingResult.sourceCompetitionId !== command.competitionId
          ) {
            errors.push(
              `Participant ${athlete.id} has a confirmed result from competition ${existingResult.sourceCompetitionId}`,
            );
            continue;
          }
          if (!hasSameResultData(existingResult, candidate)) {
            errors.push(`Participant ${athlete.id} has a confirmed result that differs from the Lane result`);
            continue;
          }
          results.push(existingResult);
          continue;
        }
        results.push(candidate);
      } catch (error) {
        errors.push(
          `Failed to prepare result for lane ${lane.laneId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    for (const existingResult of existingCompetitionResults) {
      if (existingResult.status === 'confirmed' && !laneIdByParticipantId.has(existingResult.participantId.value)) {
        errors.push(
          `Confirmed result for participant ${existingResult.participantId.value} is missing from the Lane result data`,
        );
      }
    }

    if (errors.length > 0) {
      return { savedCount: 0, errors };
    }

    try {
      this.resultRepository.replaceByCompetitionId(
        command.eventId,
        command.relayNumber,
        command.competitionId,
        results,
      );
      return { savedCount: results.length, errors: [] };
    } catch (error) {
      return {
        savedCount: 0,
        errors: [`Failed to save results: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }
}

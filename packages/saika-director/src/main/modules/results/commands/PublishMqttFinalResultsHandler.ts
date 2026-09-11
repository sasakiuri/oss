import {
  EventId,
  GetEventByIdToken,
  GetFiringPointAssignmentsByRelayToken,
  ParticipantId,
  type GetEventByIdResponse,
} from '@/main/modules/championship';
import type { IFinalControlRepository } from '@/main/modules/final-control';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { PublishResultsResponse } from '@/shared/ipc/contracts';
import type { LaneScorePayload } from '@/shared/mqtt';
import { FinalResult, type FinalStageConfig } from '../domain/FinalResult';
import { FinalResultId } from '../domain/FinalResultId';
import type { IFinalResultRepository } from '../domain/IFinalResultRepository';
import type { PublishMqttResultsCommand } from './PublishMqttResults';

/** Publishes immutable MQTT score snapshots using the independent Final-control placing ledger. */
export class PublishMqttFinalResultsHandler {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly repository: IFinalResultRepository,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly finalControl: IFinalControlRepository,
  ) {}

  async execute(command: PublishMqttResultsCommand): Promise<PublishResultsResponse> {
    const event = (await this.queryBus.execute(GetEventByIdToken, {
      eventId: command.eventId,
    })) as GetEventByIdResponse | null;
    if (!event) return failure(`Event ${command.eventId} not found`);
    if (event.eventType !== command.competitionTypeId) {
      return failure(`Event uses ${event.eventType}, but competition uses ${command.competitionTypeId}`);
    }
    const definition = this.competitionTypes.get(command.competitionTypeId);
    if (definition.config.name !== 'Final') return failure(`${definition.id} is not a Final`);
    const assignments = await this.queryBus.execute(GetFiringPointAssignmentsByRelayToken, {
      eventId: command.eventId,
      relayNumber: command.relayNumber,
    });
    const assignmentByParticipant = new Map(assignments.map((assignment) => [assignment.participantId, assignment]));
    if (assignments.length !== command.lanes.length) {
      return failure(
        `Final relay has ${assignments.length} firing-point assignments, but ${command.lanes.length} Lane snapshots were supplied`,
      );
    }

    const decisions = this.finalControl
      .findByCompetition(command.competitionId)
      .filter((decision) => !decision.voided && decision.commandCompleted);
    const participantCount = command.lanes.length;
    const rankDecision = new Map(decisions.map((decision) => [decision.rank, decision]));
    for (let rank = participantCount; rank >= 2; rank -= 1) {
      const decision = rankDecision.get(rank);
      if (!decision) return failure(`Final rank ${rank} has no completed checkpoint command`);
      if (decision.eventId && decision.eventId !== command.eventId) {
        return failure(`Final rank ${rank} checkpoint is linked to another event`);
      }
    }
    const laneDecision = new Map(decisions.map((decision) => [decision.selectedLaneId, decision]));
    if (laneDecision.size !== participantCount - 1) {
      return failure('Final checkpoint history does not identify each eliminated Lane exactly once');
    }

    const remaining = command.lanes.filter((lane) => !laneDecision.has(lane.laneId));
    if (remaining.length !== 1) return failure(`Final history must leave one winner; found ${remaining.length}`);
    const expectedAcc = definition.scoring.precision === 0 ? 'RING' : 'DECIMAL';
    const stageConfig = toFinalStageConfig(definition);
    const prepared: FinalResult[] = [];
    const seenParticipants = new Set<string>();
    for (const lane of command.lanes) {
      const athlete = lane.assignment?.competitionId === command.competitionId ? lane.assignment.athlete : null;
      const score = lane.score?.competitionId === command.competitionId ? lane.score : null;
      if (!athlete) return failure(`Lane ${lane.laneId} has no tournament athlete assigned`);
      if (!score) return failure(`Lane ${lane.laneId} has no final score snapshot`);
      if (score.acc !== expectedAcc) return failure(`Lane ${lane.laneId} scoring mode does not match ${definition.id}`);
      if (seenParticipants.has(athlete.id)) return failure(`Participant ${athlete.id} is assigned more than once`);
      seenParticipants.add(athlete.id);
      const assignment = assignmentByParticipant.get(athlete.id);
      if (!assignment) return failure(`Participant ${athlete.id} is not in the linked Final firing-point plan`);
      const placing = laneDecision.get(lane.laneId);
      const rank = placing?.rank ?? 1;
      const expectedShots = placing?.afterShot ?? definition.resultFormat.totalShots;
      if (score.totalShotCount !== expectedShots) {
        return failure(`Lane ${lane.laneId} has ${score.totalShotCount} shots; rank ${rank} requires ${expectedShots}`);
      }
      const shots = flattenShots(score);
      if (shots.length !== score.totalShotCount) return failure(`Lane ${lane.laneId} score snapshot is incomplete`);
      const stage1Shots = shots.slice(0, stageConfig.stage1TotalShots);
      const stage2Shots = shots.slice(stageConfig.stage1TotalShots);
      prepared.push(
        FinalResult.reconstruct(
          FinalResultId.generate(),
          EventId.create(command.eventId),
          ParticipantId.create(athlete.id),
          assignment.playerName,
          assignment.affiliation,
          assignment.firingPointNumber,
          stage1Shots,
          sum(stage1Shots),
          stage2Shots,
          sum(stage2Shots),
          score.totalScoreX10 / 10,
          rank,
          placing?.afterShot,
          placing?.resolution === 'SHOOT_OFF' ? placing.id : undefined,
          placing?.resolutionStatement ?? '',
          placing ? 'eliminated' : 'finished',
          stageConfig,
        ),
      );
    }

    this.repository.executeInTransaction(() => {
      this.repository.deleteByEventId(command.eventId);
      prepared.forEach((result) => this.repository.save(result, command.competitionId));
    });
    return { savedCount: prepared.length, errors: [] };
  }
}

function flattenShots(score: LaneScorePayload): number[] {
  return [...score.stages]
    .sort((left, right) => left.stageIndex - right.stageIndex)
    .flatMap((stage) =>
      [...stage.series]
        .sort((left, right) => left.seriesIndex - right.seriesIndex)
        .flatMap((series) => series.shots.map((shot) => shot / 10)),
    );
}

function toFinalStageConfig(definition: ReturnType<CompetitionTypeRegistry['get']>): FinalStageConfig {
  const stage1TotalShots = definition.resultFormat.stage1Shots ?? 0;
  const eliminationStage = definition.config.stages.find((stage) => stage.elimination);
  const checkpointSeries = eliminationStage?.elimination?.checkpointEverySeries ?? 1;
  const stage2ShotsPerSeries = eliminationStage
    ? eliminationStage.series.slice(0, checkpointSeries).reduce((total, series) => total + series.shots, 0)
    : 1;
  return {
    stage1TotalShots,
    stage2TotalShots: definition.resultFormat.totalShots - stage1TotalShots,
    stage2ShotsPerSeries,
    maxParticipants: definition.config.maxParticipants ?? 99,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function failure(message: string): PublishResultsResponse {
  return { savedCount: 0, errors: [message] };
}

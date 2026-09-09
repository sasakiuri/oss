// SPDX-License-Identifier: MIT
import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import {
  PublishMqttFinalResultsToken,
  PublishMqttMixedTeamFinalResultsToken,
  PublishMqttResultsToken,
} from '@/main/modules/results';
import { assertParticipantEligible } from '@/main/shared-infra/operations/ParticipantEligibility';
import type { mqttContract } from '@/shared/ipc/contracts';
import type { PublishResultsResponse } from '@/shared/ipc/contracts/results.contract';
import type { DirectorMqttService } from './DirectorMqttService';
import type { CompetitionResultLane } from './DirectorMqttTypes';
import { assertPhaseStartReady } from './PhaseStartGuard';

import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { ICompetitionDataGuard } from '@/main/shared-infra/operations/CompetitionDataGuard';
import type { ICompetitionStartReadiness } from '@/main/shared-infra/operations/CompetitionStartReadiness';
import type { IParticipantEligibilityReader } from '@/main/shared-infra/operations/ParticipantEligibility';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { InferHandlers } from '@/shared/ipc/defineContract';
import type { CompetitionStatePayload } from '@/shared/mqtt';
import { getLaneCompetitionMetadata, getNextSeriesTimer } from './CompetitionSeriesNavigation';

interface Dependencies {
  readonly mqttService: Pick<
    DirectorMqttService,
    | 'getSnapshot'
    | 'getClockStartIssues'
    | 'getTimingEvidenceStartIssues'
    | 'getTimedTargetStartIssues'
    | 'createCompetition'
    | 'joinCompetition'
    | 'leaveCompetition'
    | 'assignAthlete'
    | 'resetSession'
    | 'pauseLaneTimer'
    | 'resumeLaneTimer'
    | 'resumeLaneMatch'
    | 'pauseRangeTimers'
    | 'resumeRangeTimers'
    | 'resumeRangeMatch'
    | 'startSighting'
    | 'endSighting'
    | 'startMatch'
    | 'startTimedTarget'
    | 'recordTimedTargetUnload'
    | 'cancelTimedTarget'
    | 'restartTimer'
    | 'advanceSeries'
    | 'finishCompetition'
  >;
  readonly runWithControlLock: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly competitionTypeRegistry: Pick<CompetitionTypeRegistry, 'get'>;
  readonly competitionDataGuard: ICompetitionDataGuard;
  readonly participantEligibilityReader: IParticipantEligibilityReader;
  readonly commandBus: Pick<CommandBus, 'execute'>;
  readonly queryBus: Pick<QueryBus, 'execute'>;
  readonly competitionStartReadiness: ICompetitionStartReadiness;
  readonly requireCompetition: (competitionId: string) => CompetitionStatePayload;
}

type Handlers = Pick<
  InferHandlers<typeof mqttContract>,
  | 'getStartReadiness'
  | 'createCompetition'
  | 'joinCompetition'
  | 'leaveCompetition'
  | 'assignAthlete'
  | 'resetSession'
  | 'pauseLaneTimer'
  | 'resumeLaneTimer'
  | 'resumeLaneMatch'
  | 'pauseRangeTimers'
  | 'resumeRangeTimers'
  | 'resumeRangeMatch'
  | 'startSighting'
  | 'endSighting'
  | 'startMatch'
  | 'startTimedTarget'
  | 'recordTimedTargetUnload'
  | 'cancelTimedTarget'
  | 'restartTimer'
  | 'advanceSeries'
  | 'finishCompetition'
>;

export function createCompetitionControlHandlers({
  mqttService,
  runWithControlLock,
  competitionTypeRegistry,
  competitionDataGuard,
  participantEligibilityReader,
  commandBus,
  queryBus,
  competitionStartReadiness,
  requireCompetition,
}: Dependencies): Handlers {
  return {
    getStartReadiness: async (input) => {
      const competition = mqttService
        .getSnapshot()
        .competitions.find((item) => item.competitionId === input.competitionId);
      if (!competition) throw new Error('Competition not found');
      const scope = { ...input, laneIds: competition.laneIds };
      return {
        ...scope,
        checkedAt: new Date().toISOString(),
        issues: [
          ...competitionStartReadiness.getStartIssues(scope),
          ...mqttService.getClockStartIssues(scope.laneIds),
          ...mqttService.getTimingEvidenceStartIssues(scope.laneIds),
          ...(competitionTypeRegistry.get(competition.competitionTypeId).timedTarget
            ? mqttService.getTimedTargetStartIssues(scope.laneIds)
            : []),
        ],
      };
    },
    createCompetition: (input) =>
      runWithControlLock(async () => {
        const definition = competitionTypeRegistry.get(input.competitionTypeId);
        const metadata = getLaneCompetitionMetadata(definition);
        const matchStage = definition.config.stages.find((stage) => stage.type === 'match');
        const shotsPerSeries = matchStage?.series[0]?.shots ?? 0;
        if (!matchStage || shotsPerSeries <= 0) {
          throw new Error(`Competition type ${definition.id} has no MQTT-compatible match stage`);
        }
        return mqttService.createCompetition({
          competitionTypeId: definition.id,
          competitionTypeName: definition.name,
          discipline: metadata.discipline,
          roundName: definition.config.name,
          competitionUnit: definition.teamFormat === 'MIXED_PAIR' ? 'MIXED_TEAM' : 'INDIVIDUAL',
          definitionBinding: {
            protocolVersion: 1,
            compatibilityMode: definition.compatibilityMode ?? (definition.rulePackIdentity ? 'REQUIRED' : 'ADVISORY'),
            ...(definition.rulePackIdentity ? { rulePack: definition.rulePackIdentity } : {}),
          },
          acc: metadata.acc,
          shotsPerSeries,
          totalSeries: definition.resultFormat.totalSeries,
          totalShots: definition.resultFormat.totalShots,
          // joinCompetition publishes the provisional membership immediately
          // before issuing Lane commands. Keep creation itself recoverable if
          // the renderer exits between the two IPC calls.
          laneIds: [],
        });
      }),
    joinCompetition: (input) =>
      runWithControlLock(() => mqttService.joinCompetition(input.competitionId, input.laneIds)),
    leaveCompetition: (input) =>
      runWithControlLock(async () => {
        for (const laneId of input.laneIds) {
          competitionDataGuard.assertAllowed({ operation: 'LEAVE_LANE', competitionId: input.competitionId, laneId });
        }
        return mqttService.leaveCompetition(input.competitionId, input.laneIds);
      }),
    assignAthlete: (input) =>
      runWithControlLock(() => {
        if (input.athlete && !input.athlete.id.startsWith('manual-')) {
          assertParticipantEligible(participantEligibilityReader, input.athlete.id);
        }
        return mqttService.assignAthlete(input.competitionId, input.laneId, input.athlete);
      }),
    resetSession: (input) =>
      runWithControlLock(() => {
        competitionDataGuard.assertAllowed({
          operation: 'RESET_LANE_SESSION',
          competitionId: input.competitionId,
          laneId: input.laneId,
        });
        return mqttService.resetSession(input.competitionId, input.laneId, input.reason);
      }),
    pauseLaneTimer: (input) =>
      runWithControlLock(() => mqttService.pauseLaneTimer(input.competitionId, input.laneId, input.interruptionId)),
    resumeLaneTimer: (input) =>
      runWithControlLock(() =>
        mqttService.resumeLaneTimer(
          input.competitionId,
          input.laneId,
          input.interruptionId,
          input.authorizedRemainingSeconds,
          input.unlimitedSightingShots,
        ),
      ),
    resumeLaneMatch: (input) =>
      runWithControlLock(() => mqttService.resumeLaneMatch(input.competitionId, input.laneId, input.interruptionId)),
    pauseRangeTimers: (input) =>
      runWithControlLock(() => mqttService.pauseRangeTimers(input.competitionId, input.laneIds, input.interruptionId)),
    resumeRangeTimers: (input) =>
      runWithControlLock(() =>
        mqttService.resumeRangeTimers(
          input.competitionId,
          input.laneIds,
          input.interruptionId,
          input.authorizedRemainingSeconds,
          input.unlimitedSightingShots,
        ),
      ),
    resumeRangeMatch: (input) =>
      runWithControlLock(() => mqttService.resumeRangeMatch(input.competitionId, input.laneIds, input.interruptionId)),
    startSighting: (input) =>
      runWithControlLock(() => {
        const competition = requireCompetition(input.competitionId);
        if (competition.phase === 'NOT_STARTED') {
          assertPhaseStartReady(
            competitionTypeRegistry.get(competition.competitionTypeId),
            'SIGHTING',
            input.acknowledgedRequirementIds,
          );
        }
        return mqttService.startSighting(input.competitionId, input.durationSeconds, input.targetLaneIds);
      }),
    endSighting: (input) => runWithControlLock(() => mqttService.endSighting(input.competitionId)),
    startMatch: (input) =>
      runWithControlLock(() => {
        const competition = requireCompetition(input.competitionId);
        const definition = competitionTypeRegistry.get(competition.competitionTypeId);
        if (definition.timedTarget && input.durationSeconds !== undefined) {
          throw new Error(`Timed-target competition ${definition.id} must not use a generic MATCH timer`);
        }
        if (!definition.timedTarget && input.durationSeconds === undefined) {
          throw new Error(`Competition type ${definition.id} requires a generic MATCH timer duration`);
        }
        if (competition.phase === 'SIGHTING_COMPLETE') {
          assertPhaseStartReady(definition, 'MATCH', input.acknowledgedRequirementIds);
        }
        return mqttService.startMatch(input.competitionId, input.durationSeconds);
      }),
    startTimedTarget: (input) =>
      runWithControlLock(() => {
        const competition = requireCompetition(input.competitionId);
        const definition = competitionTypeRegistry.get(competition.competitionTypeId);
        if (!definition.timedTarget) throw new Error(`Competition type ${definition.id} has no timed target program`);
        const stage = definition.config.stages[input.stageIndex];
        const series = stage?.series[input.seriesIndex];
        if (!stage || !series || stage.type !== 'match') {
          throw new Error(`Timed target position ${input.stageIndex}:${input.seriesIndex} is not configured`);
        }
        const expectedProgramId =
          input.purpose === 'SIGHTING' ? stage.sightingTimedTargetProgramId : series.timedTargetProgramId;
        if (expectedProgramId !== input.programId) {
          throw new Error(
            `Timed target program ${input.programId} does not match ${input.purpose} at ${input.stageIndex}:${input.seriesIndex}`,
          );
        }
        const program = definition.timedTarget.programs.find((candidate) => candidate.id === input.programId);
        if (!program || program.purpose !== input.purpose) {
          throw new Error(`Timed target program ${input.programId} is not available for ${input.purpose}`);
        }
        return mqttService.startTimedTarget(input);
      }),
    recordTimedTargetUnload: (input) => runWithControlLock(() => mqttService.recordTimedTargetUnload(input)),
    cancelTimedTarget: (input) => runWithControlLock(() => mqttService.cancelTimedTarget(input)),
    restartTimer: (input) =>
      runWithControlLock(() =>
        mqttService.restartTimer(
          input.competitionId,
          input.timerScope,
          input.durationSeconds,
          input.stageIndex,
          input.seriesIndex,
        ),
      ),
    advanceSeries: (input) =>
      runWithControlLock(() => {
        const competition = requireCompetition(input.competitionId);
        const definition = competitionTypeRegistry.get(competition.competitionTypeId);
        return mqttService.advanceSeries(
          input.competitionId,
          input.stageIndex,
          input.fromSeriesIndex,
          input.resumeOnly,
          getNextSeriesTimer(definition, input.stageIndex, input.fromSeriesIndex),
        );
      }),
    finishCompetition: (input) =>
      runWithControlLock(async () => {
        const competition = requireCompetition(input.competitionId);

        if (input.resultContext && !competition.cleanupPreparedAt) {
          if (competition.phase !== 'MATCH' && competition.phase !== 'MATCH_COMPLETE') {
            throw new Error(
              `Cannot publish results while competition ${input.competitionId} is in phase ${competition.phase}`,
            );
          }
          const event = (await queryBus.execute(GetEventByIdToken, {
            eventId: input.resultContext.eventId,
          })) as GetEventByIdResponse | null;
          if (event && event.eventType !== competition.competitionTypeId) {
            throw new Error(
              `Selected event uses competition type ${event.eventType}, but the active competition uses ${competition.competitionTypeId}`,
            );
          }
        }

        let resultPublication: PublishResultsResponse | undefined;
        const resultContext = input.resultContext;
        const beforeCleanup = resultContext
          ? async (lanes: CompetitionResultLane[]) => {
              try {
                const publicationToken =
                  competition.roundName !== 'Final'
                    ? PublishMqttResultsToken
                    : competition.competitionUnit === 'MIXED_TEAM'
                      ? PublishMqttMixedTeamFinalResultsToken
                      : PublishMqttFinalResultsToken;
                resultPublication = await commandBus.execute(publicationToken, {
                  competitionId: input.competitionId,
                  competitionTypeId: competition.competitionTypeId,
                  eventId: resultContext.eventId,
                  relayNumber: resultContext.relayNumber,
                  lanes,
                });
                return resultPublication.errors.length === 0;
              } catch (error) {
                resultPublication = {
                  savedCount: 0,
                  errors: [error instanceof Error ? error.message : String(error)],
                };
                return false;
              }
            }
          : undefined;
        const beforeDataClear = () =>
          competitionDataGuard.assertAllowed({
            operation: 'CLEAR_COMPETITION_DATA',
            competitionId: input.competitionId,
          });
        const result = await mqttService.finishCompetition(input.competitionId, beforeCleanup, beforeDataClear);
        return resultPublication ? { ...result, resultPublication } : result;
      }),
  };
}

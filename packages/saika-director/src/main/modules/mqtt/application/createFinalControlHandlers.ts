// SPDX-License-Identifier: MIT
import type { mqttContract } from '@/shared/ipc/contracts';
import type { DirectorMqttService } from './DirectorMqttService';
import { executeFinalScriptStep } from './FinalScriptStepExecutor';
import { orderFinalShootOffLaneIds } from './FinalShootOffParticipantOrder';
import { assertPhaseStartReady } from './PhaseStartGuard';

import type { FinalOperationService } from '@/main/modules/final-operations';
import type { FinalResultDeclarationService } from '@/main/modules/result-publication';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { InferHandlers } from '@/shared/ipc/defineContract';
import type { CompetitionStatePayload } from '@/shared/mqtt';
import { getNextSeriesTimer, getPreviousSeriesPosition } from './CompetitionSeriesNavigation';

interface Dependencies {
  readonly mqttService: Pick<
    DirectorMqttService,
    | 'publishCompetitionCue'
    | 'startSighting'
    | 'endSighting'
    | 'startMatch'
    | 'advanceSeries'
    | 'getSnapshot'
    | 'startShootOff'
    | 'startTimedTarget'
    | 'stopActiveTimer'
    | 'stopShootOff'
    | 'clearCompetitionCue'
    | 'retireFinalist'
  >;
  readonly runWithControlLock: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly competitionTypeRegistry: Pick<CompetitionTypeRegistry, 'get'>;
  readonly finalOperationService: Pick<FinalOperationService, 'assertExecutionAuthorized'>;
  readonly finalResultDeclarationService: Pick<FinalResultDeclarationService, 'getStatus' | 'declare'>;
  readonly requireCompetition: (competitionId: string) => CompetitionStatePayload;
}

type Handlers = Pick<InferHandlers<typeof mqttContract>, 'executeFinalScriptStep' | 'clearFinalCue' | 'retireFinalist'>;

export function createFinalControlHandlers({
  mqttService,
  runWithControlLock,
  competitionTypeRegistry,
  finalOperationService,
  finalResultDeclarationService,
  requireCompetition,
}: Dependencies): Handlers {
  return {
    executeFinalScriptStep: (input) =>
      runWithControlLock(() => {
        const authorization = finalOperationService.assertExecutionAuthorized({
          competitionId: input.competitionId,
          runId: input.runId,
          confirmationEntryId: input.confirmationEntryId,
          branch: input.branch,
          iteration: input.iteration,
          step: input.step,
          eligibleLaneIds: input.eligibleLaneIds ?? [],
        });
        const isDeclaration = input.step.effect.type === 'DECLARE_RESULTS';
        if (!isDeclaration && input.declarationConfirmation) {
          throw new Error('Declaration confirmations are only valid for RESULTS ARE FINAL');
        }
        if (isDeclaration && !authorization.eventId) {
          throw new Error('RESULTS ARE FINAL requires the Final run to be linked to an event');
        }
        if (
          isDeclaration &&
          (!input.declarationConfirmation?.finalProtestsResolved ||
            !input.declarationConfirmation.resultProcessConfirmed)
        ) {
          throw new Error('RESULTS ARE FINAL requires explicit protest and result-process confirmations');
        }
        const declaration = isDeclaration
          ? {
              eventId: authorization.eventId!,
              finalProtestsResolved: input.declarationConfirmation!.finalProtestsResolved,
              resultProcessConfirmed: input.declarationConfirmation!.resultProcessConfirmed,
              statement: input.step.text,
              officialName: authorization.officialName,
            }
          : null;
        return executeFinalScriptStep(
          {
            competitionId: input.competitionId,
            runId: input.runId,
            confirmationEntryId: input.confirmationEntryId,
            branch: input.branch,
            iteration: input.iteration,
            step: input.step,
            eligibleLaneIds: input.eligibleLaneIds ?? [],
            acknowledgedRequirementIds: input.acknowledgedRequirementIds ?? [],
            declaration,
          },
          {
            publishCue: async (cue) => {
              await mqttService.publishCompetitionCue(cue);
            },
            openSighting: async (durationSeconds, acknowledgedRequirementIds) => {
              const competition = requireCompetition(input.competitionId);
              if (competition.phase === 'SIGHTING') return null;
              assertPhaseStartReady(
                competitionTypeRegistry.get(competition.competitionTypeId),
                'SIGHTING',
                acknowledgedRequirementIds,
              );
              return mqttService.startSighting(input.competitionId, durationSeconds);
            },
            closeSighting: async () => {
              const phase = requireCompetition(input.competitionId).phase;
              if (phase === 'SIGHTING_COMPLETE' || phase === 'MATCH' || phase === 'MATCH_COMPLETE') return null;
              return mqttService.endSighting(input.competitionId);
            },
            openMatch: async (step, acknowledgedRequirementIds) => {
              if (step.effect.type !== 'OPEN_FIRING' || step.effect.purpose !== 'MATCH' || !step.effect.target) {
                throw new Error(`Final step ${step.id} has no MATCH target`);
              }
              const target = step.effect.target;
              const competition = requireCompetition(input.competitionId);
              const definition = competitionTypeRegistry.get(competition.competitionTypeId);
              const alreadyAtTarget =
                competition.phase === 'MATCH' &&
                competition.laneIds.every((laneId) => {
                  const laneState = mqttService
                    .getSnapshot()
                    .lanes.find((lane) => lane.laneId === laneId)?.competitionState;
                  return (
                    laneState?.competitionId === input.competitionId &&
                    laneState.currentStage.index === target.stageIndex &&
                    laneState.currentSeries.index === target.seriesIndex
                  );
                });
              if (alreadyAtTarget) return null;

              const previous = getPreviousSeriesPosition(definition, target);
              if (!previous) {
                assertPhaseStartReady(definition, 'MATCH', acknowledgedRequirementIds);
                return mqttService.startMatch(input.competitionId, step.effect.durationSeconds);
              }
              const nextTimer = getNextSeriesTimer(definition, previous.stageIndex, previous.seriesIndex);
              if (
                !nextTimer ||
                nextTimer.stageIndex !== target.stageIndex ||
                nextTimer.seriesIndex !== target.seriesIndex ||
                nextTimer.durationSeconds !== step.effect.durationSeconds
              ) {
                throw new Error(`Final script timer does not match target ${target.stageIndex}:${target.seriesIndex}`);
              }
              return mqttService.advanceSeries(
                input.competitionId,
                previous.stageIndex,
                previous.seriesIndex,
                undefined,
                nextTimer,
              );
            },
            runTimedTarget: async (step, acknowledgedRequirementIds, eligibleLaneIds) => {
              if (step.effect.type !== 'RUN_TIMED_TARGET') {
                throw new Error(`Final step ${step.id} is not a timed-target step`);
              }
              const effect = step.effect;
              let competition = requireCompetition(input.competitionId);
              const definition = competitionTypeRegistry.get(competition.competitionTypeId);
              if (!definition.timedTarget) {
                throw new Error(`Final step ${step.id} requires an unavailable timed-target capability`);
              }
              const program = definition.timedTarget.programs.find(
                (candidate) => candidate.id === effect.programId && candidate.purpose === effect.purpose,
              );
              if (!program) throw new Error(`Final step ${step.id} timed-target program is unavailable`);

              if (effect.purpose === 'SHOOT_OFF') {
                if (!effect.participantExecution) {
                  throw new Error(`Final step ${step.id} has no shoot-off participant execution mode`);
                }
                const snapshot = mqttService.getSnapshot();
                const activeLaneIds = competition.laneIds.filter((laneId) => {
                  const state = snapshot.lanes.find((lane) => lane.laneId === laneId)?.competitionState;
                  return state?.competitionId !== input.competitionId || state.phase !== 'FINISHED';
                });
                const targetLaneIds = [...new Set(eligibleLaneIds)];
                if (targetLaneIds.length < 2) throw new Error('Timed-target shoot-off requires at least two Lanes');
                const inactiveLaneIds = targetLaneIds.filter((laneId) => !activeLaneIds.includes(laneId));
                if (inactiveLaneIds.length > 0) {
                  throw new Error(`Timed-target shoot-off selected retired Lane(s): ${inactiveLaneIds.join(', ')}`);
                }

                const orderedLaneIds = orderFinalShootOffLaneIds(
                  targetLaneIds,
                  effect.participantExecution,
                  effect.participantOrder,
                  (laneId) => snapshot.lanes.find((lane) => lane.laneId === laneId)?.assignment?.athlete?.startNumber,
                );

                return mqttService.startShootOff(
                  input.competitionId,
                  input.runId,
                  input.iteration,
                  {
                    type: 'TIMED_TARGET',
                    programId: program.id,
                    participantExecution: effect.participantExecution,
                  },
                  effect.shotsPerParticipant,
                  orderedLaneIds,
                );
              }

              if (!effect.target) throw new Error(`Final step ${step.id} has no timed-target series target`);
              const target = effect.target;
              const stage = definition.config.stages[target.stageIndex];
              const series = stage?.series[target.seriesIndex];
              if (!stage || !series || stage.type !== 'match') {
                throw new Error(`Final step ${step.id} targets an unavailable timed-target series`);
              }

              if (competition.phase === 'NOT_STARTED') {
                if (effect.purpose !== 'SIGHTING') {
                  throw new Error('The configured sighting sequence must run before MATCH timed-target firing');
                }
                assertPhaseStartReady(definition, 'SIGHTING', acknowledgedRequirementIds);
                const preparationDuration =
                  definition.config.stages.find((candidate) => candidate.type === 'preparation')?.timer.durationSec ??
                  1;
                const sightingStart = await mqttService.startSighting(input.competitionId, preparationDuration);
                assertCommandSucceeded(sightingStart, 'Preparing the Lane sighting stage');
                competition = requireCompetition(input.competitionId);
              }
              if (competition.phase === 'SIGHTING') {
                const sightingEnd = await mqttService.endSighting(input.competitionId);
                assertCommandSucceeded(sightingEnd, 'Closing the Lane sighting stage');
                competition = requireCompetition(input.competitionId);
              }
              if (competition.phase === 'SIGHTING_COMPLETE') {
                assertPhaseStartReady(definition, 'MATCH', acknowledgedRequirementIds);
                const matchStart = await mqttService.startMatch(input.competitionId);
                assertCommandSucceeded(matchStart, 'Entering the timed-target MATCH stage');
                competition = requireCompetition(input.competitionId);
              }
              if (competition.phase !== 'MATCH') {
                throw new Error(`Timed-target Final cannot run from competition phase ${competition.phase}`);
              }

              const snapshot = mqttService.getSnapshot();
              const activeLaneIds = competition.laneIds.filter((laneId) => {
                const state = snapshot.lanes.find((lane) => lane.laneId === laneId)?.competitionState;
                return state?.competitionId !== input.competitionId || state.phase !== 'FINISHED';
              });
              const targetLaneIds = [...new Set(eligibleLaneIds.length > 0 ? eligibleLaneIds : activeLaneIds)];
              if (targetLaneIds.length === 0) throw new Error('Timed-target Final step has no active Lane');
              const inactiveLaneIds = targetLaneIds.filter((laneId) => !activeLaneIds.includes(laneId));
              if (inactiveLaneIds.length > 0) {
                throw new Error(`Timed-target Final step selected retired Lane(s): ${inactiveLaneIds.join(', ')}`);
              }

              const atTarget = targetLaneIds.every((laneId) => {
                const laneState = mqttService
                  .getSnapshot()
                  .lanes.find((lane) => lane.laneId === laneId)?.competitionState;
                return (
                  laneState?.competitionId === input.competitionId &&
                  laneState.phase === 'MATCH' &&
                  laneState.awaitingSeriesStart !== true &&
                  laneState.currentStage.index === target.stageIndex &&
                  laneState.currentSeries.index === target.seriesIndex
                );
              });
              if (!atTarget) {
                const previous = getPreviousSeriesPosition(definition, target);
                if (previous) {
                  const advanced = await mqttService.advanceSeries(
                    input.competitionId,
                    previous.stageIndex,
                    previous.seriesIndex,
                  );
                  assertCommandSucceeded(advanced, `Advancing to ${target.stageIndex}:${target.seriesIndex}`);
                }
              }

              return mqttService.startTimedTarget({
                competitionId: input.competitionId,
                programId: program.id,
                purpose: effect.purpose,
                stageIndex: target.stageIndex,
                seriesIndex: target.seriesIndex,
                targetLaneIds,
              });
            },
            closeMatch: async () => {
              const competition = requireCompetition(input.competitionId);
              if (competition.phase === 'MATCH_COMPLETE' || !competition.activeTimer) return null;
              return mqttService.stopActiveTimer(input.competitionId);
            },
            openShootOff: async (durationSeconds, shotsPerLane, eligibleLaneIds) =>
              mqttService.startShootOff(
                input.competitionId,
                input.runId,
                input.iteration,
                { type: 'GENERIC', durationSeconds },
                shotsPerLane,
                eligibleLaneIds,
              ),
            closeShootOff: async (eligibleLaneIds) =>
              mqttService.stopShootOff(input.competitionId, input.runId, input.iteration, eligibleLaneIds),
            declareResults: async (declarationInput) => {
              const current = await finalResultDeclarationService.getStatus(declarationInput.eventId);
              if (current.declaration) {
                if (!current.declarationCurrent || current.issues.length > 0) {
                  throw new Error('The existing Final declaration is no longer current or has review blockers');
                }
                return { declarationId: current.declaration.id, replayed: true };
              }
              const declared = await finalResultDeclarationService.declare(declarationInput);
              if (!declared.declaration) throw new Error('The Final result declaration was not persisted');
              return { declarationId: declared.declaration.id, replayed: false };
            },
          },
        );
      }),
    clearFinalCue: (input) => runWithControlLock(() => mqttService.clearCompetitionCue(input.competitionId)),
    retireFinalist: (input) =>
      runWithControlLock(() =>
        mqttService.retireFinalist(input.competitionId, input.laneId, input.checkpointId, input.rank, input.afterShot),
      ),
  };
}

function assertCommandSucceeded(
  result: { success: boolean; lanes: readonly { laneId: string; status: string }[] },
  action: string,
): void {
  if (result.success) return;
  const failed = result.lanes.filter((lane) => lane.status !== 'done').map((lane) => lane.laneId);
  throw new Error(`${action} did not complete on Lane(s): ${failed.join(', ') || 'unknown'}`);
}

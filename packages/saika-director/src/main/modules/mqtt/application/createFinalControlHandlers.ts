// SPDX-License-Identifier: MIT
import type { mqttContract } from '@/shared/ipc/contracts';
import { createFinalScriptStepPort, type FinalScriptStepPortDependencies } from './createFinalScriptStepPort';
import type { DirectorMqttService } from './DirectorMqttService';
import { executeFinalScriptStep, type FinalScriptStepExecutionInput } from './FinalScriptStepExecutor';

import type { FinalOperationService } from '@/main/modules/final-operations';
import type { InferHandlers } from '@sasakiuri/saika-ipc';

interface Dependencies extends Omit<FinalScriptStepPortDependencies, 'mqttService'> {
  readonly mqttService: FinalScriptStepPortDependencies['mqttService'] &
    Pick<DirectorMqttService, 'clearCompetitionCue' | 'retireFinalist'>;
  readonly runWithControlLock: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly finalOperationService: Pick<FinalOperationService, 'assertExecutionAuthorized'>;
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
        let declaration: FinalScriptStepExecutionInput['declaration'] = null;
        if (input.step.effect.type === 'DECLARE_RESULTS') {
          const { eventId } = authorization;
          if (!eventId) throw new Error('RESULTS ARE FINAL requires the Final run to be linked to an event');
          const confirmation = input.declarationConfirmation;
          if (!confirmation?.finalProtestsResolved || !confirmation.resultProcessConfirmed) {
            throw new Error('RESULTS ARE FINAL requires explicit protest and result-process confirmations');
          }
          declaration = {
            eventId,
            finalProtestsResolved: confirmation.finalProtestsResolved,
            resultProcessConfirmed: confirmation.resultProcessConfirmed,
            statement: input.step.text,
            officialName: authorization.officialName,
          };
        } else if (input.declarationConfirmation) {
          throw new Error('Declaration confirmations are only valid for RESULTS ARE FINAL');
        }
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
          createFinalScriptStepPort(input, {
            mqttService,
            competitionTypeRegistry,
            finalResultDeclarationService,
            requireCompetition,
          }),
        );
      }),
    clearFinalCue: (input) => runWithControlLock(() => mqttService.clearCompetitionCue(input.competitionId)),
    retireFinalist: (input) =>
      runWithControlLock(() =>
        mqttService.retireFinalist(input.competitionId, input.laneId, input.checkpointId, input.rank, input.afterShot),
      ),
  };
}

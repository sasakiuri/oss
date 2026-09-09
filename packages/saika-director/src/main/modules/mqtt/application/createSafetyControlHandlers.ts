// SPDX-License-Identifier: MIT
import type { mqttContract } from '@/shared/ipc/contracts';
import { SAFETY_STOP_CLEARANCE_RULE_REFERENCES, SafetyStopClearancePolicy } from '../domain/SafetyStopClearancePolicy';
import type { DirectorMqttService } from './DirectorMqttService';
import type { CommandBatchResult } from './DirectorMqttTypes';

import type { InferHandlers } from '@/shared/ipc/defineContract';
import type { ISafetyStopAuditJournal } from '../domain/ISafetyStopAuditJournal';

interface Dependencies {
  readonly mqttService: Pick<DirectorMqttService, 'activateSafetyStop' | 'getSnapshot' | 'clearSafetyStop'>;
  readonly runWithControlLock: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly safetyStopAuditJournal: ISafetyStopAuditJournal;
  readonly safetyStopClearancePolicy: Pick<SafetyStopClearancePolicy, 'validate'>;
}

type Handlers = Pick<
  InferHandlers<typeof mqttContract>,
  'getSafetyStopAudit' | 'activateSafetyStop' | 'clearSafetyStop'
>;

export function createSafetyControlHandlers({
  mqttService,
  runWithControlLock,
  safetyStopAuditJournal,
  safetyStopClearancePolicy,
}: Dependencies): Handlers {
  return {
    getSafetyStopAudit: async (input) =>
      safetyStopAuditJournal.find(input.safetyStopId).map((entry) => ({
        ...entry,
        targetLaneIds: [...entry.targetLaneIds],
        occurredAt: entry.occurredAt.toISOString(),
        recordedAt: entry.recordedAt.toISOString(),
        laneOutcomes: entry.laneOutcomes.map((outcome) => ({
          ...outcome,
          acknowledgedAt: outcome.acknowledgedAt?.toISOString() ?? null,
        })),
        laneClearances: entry.laneClearances.map((clearance) => ({
          ...clearance,
          verifiedAt: clearance.verifiedAt.toISOString(),
          recordedAt: clearance.recordedAt.toISOString(),
          ruleReferences: [...clearance.ruleReferences],
        })),
      })),
    activateSafetyStop: (input) =>
      runWithControlLock(async () => {
        const occurredAt = new Date();
        const result = await mqttService.activateSafetyStop(
          input.laneIds,
          input.safetyStopId,
          input.reason,
          input.officialName,
        );
        safetyStopAuditJournal.append({
          id: crypto.randomUUID(),
          safetyStopId: input.safetyStopId,
          operation: 'ACTIVATE',
          targetLaneIds: [...new Set(input.laneIds)],
          success: result.success,
          reason: input.reason,
          officialName: input.officialName,
          occurredAt,
          recordedAt: new Date(),
          laneOutcomes: toSafetyLaneOutcomes(result),
          laneClearances: [],
        });
        return result;
      }),
    clearSafetyStop: (input) =>
      runWithControlLock(async () => {
        safetyStopClearancePolicy.validate(input, mqttService.getSnapshot());
        const occurredAt = new Date();
        const targetLaneIds = input.laneClearances.map((clearance) => clearance.laneId);
        const result = await mqttService.clearSafetyStop(
          targetLaneIds,
          input.safetyStopId,
          input.clearanceReason,
          input.officialName,
        );
        const recordedAt = new Date();
        safetyStopAuditJournal.append({
          id: crypto.randomUUID(),
          safetyStopId: input.safetyStopId,
          operation: 'CLEAR',
          targetLaneIds,
          success: result.success,
          reason: input.clearanceReason,
          officialName: input.officialName,
          occurredAt,
          recordedAt,
          laneOutcomes: toSafetyLaneOutcomes(result),
          laneClearances: input.laneClearances.map((clearance) => ({
            id: crypto.randomUUID(),
            laneId: clearance.laneId,
            participantId: clearance.participantId,
            participantName: clearance.participantName,
            athleteConfirmationStatus: clearance.athleteConfirmation.status,
            athleteConfirmedBy:
              clearance.athleteConfirmation.status === 'CONFIRMED' ? clearance.athleteConfirmation.confirmedBy : null,
            notApplicableReason:
              clearance.athleteConfirmation.status === 'NOT_APPLICABLE' ? clearance.athleteConfirmation.reason : null,
            firearmCondition: clearance.firearmCondition,
            personnelClear: true,
            verifiedBy: clearance.verifiedBy,
            verificationNote: clearance.verificationNote ?? null,
            verifiedAt: occurredAt,
            recordedAt,
            ruleReferences: SAFETY_STOP_CLEARANCE_RULE_REFERENCES,
          })),
        });
        return result;
      }),
  };
}

function toSafetyLaneOutcomes(result: CommandBatchResult) {
  return result.commands.flatMap((command) =>
    command.lanes.map((lane) => ({
      laneId: lane.laneId,
      status: lane.status,
      errorCode: lane.error?.code ?? null,
      errorMessage: lane.error?.message ?? null,
      acknowledgedAt: lane.acknowledgedAt ? new Date(lane.acknowledgedAt) : null,
    })),
  );
}

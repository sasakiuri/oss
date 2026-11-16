// SPDX-License-Identifier: MIT
import { FinalFiringContextToken, FinalFiringTransportToken } from '@/main/modules/final-recovery-firing';
import {
  ApplyQualificationRecoverySettlementTransportToken,
  ApplyQualificationRecoveryTransportToken,
  CancelQualificationRecoveryTransportToken,
  StartQualificationRecoveryTransportToken,
  type StartQualificationRecoveryTransportInput,
} from '@/main/modules/range-interruptions';
import {
  ResumeReserveLaneToken,
  ResumeReserveMatchToken,
  TransferReserveLaneToken,
} from '@/main/modules/reserve-lane-transfers';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { CompetitionStatePayload } from '@sasakiuri/saika-protocol/CompetitionState';

import type { DirectorMqttService } from './DirectorMqttService';

interface Dependencies {
  readonly commandBus: Pick<CommandBus, 'register'>;
  readonly mqttService: Pick<
    DirectorMqttService,
    | 'getFinalFiringContext'
    | 'executeFinalFiring'
    | 'transferReserveLane'
    | 'resumeLaneTimer'
    | 'resumeLaneMatch'
    | 'startQualificationRecovery'
    | 'cancelQualificationRecovery'
    | 'applyQualificationRecovery'
    | 'settleQualificationRecovery'
  >;
  readonly runWithControlLock: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly competitionTypeRegistry: Pick<CompetitionTypeRegistry, 'get'>;
  readonly requireCompetition: (competitionId: string) => CompetitionStatePayload;
}

/**
 * Serves the MQTT commands that other modules send through the command bus: Final firing, reserve Lane
 * transfer and Qualification recovery. Recovery commands run under the competition control lock.
 */
export function registerMqttTransportCommands({
  commandBus,
  mqttService,
  runWithControlLock,
  competitionTypeRegistry,
  requireCompetition,
}: Dependencies): void {
  commandBus.register(FinalFiringContextToken, async ({ competitionId, laneId }) =>
    mqttService.getFinalFiringContext(competitionId, laneId),
  );
  commandBus.register(FinalFiringTransportToken, (input) => mqttService.executeFinalFiring(input));
  commandBus.register(TransferReserveLaneToken, (input) => mqttService.transferReserveLane(input));
  commandBus.register(ResumeReserveLaneToken, async (input) => {
    const result = await mqttService.resumeLaneTimer(
      input.competitionId,
      input.laneId,
      input.transferId,
      input.grant.remainingSeconds,
      input.grant.unlimitedSightingShots,
    );
    if (!result.success) throw new Error(result.lanes[0]?.error?.message ?? 'Lane resume was not acknowledged');
  });
  commandBus.register(ResumeReserveMatchToken, async (input) => {
    const result = await mqttService.resumeLaneMatch(input.competitionId, input.laneId, input.transferId);
    if (!result.success) throw new Error(result.lanes[0]?.error?.message ?? 'MATCH resume was not acknowledged');
  });

  const assertQualificationRecoveryPosition = (input: {
    competitionId: string;
    stageIndex: number;
    seriesIndex: number;
    expectedMatchProgramId: string;
    expectedSeriesShotLimit: number;
  }): void => {
    const competition = requireCompetition(input.competitionId);
    const definition = competitionTypeRegistry.get(competition.competitionTypeId);
    if (competition.roundName !== 'Qualification' || definition.config.name !== 'Qualification') {
      throw new Error('Qualification recovery requires a Qualification competition');
    }
    if (definition.timedTarget?.recovery.procedure !== 'QUALIFICATION') {
      throw new Error(`Competition type ${definition.id} has no Qualification recovery capability`);
    }
    const stage = definition.config.stages[input.stageIndex];
    const series = stage?.series[input.seriesIndex];
    if (!stage || !series || stage.type !== 'match') {
      throw new Error(`Qualification recovery position ${input.stageIndex}:${input.seriesIndex} is not configured`);
    }
    if (series.timedTargetProgramId !== input.expectedMatchProgramId) {
      throw new Error(
        `Recovery program ${input.expectedMatchProgramId} does not match ${input.stageIndex}:${input.seriesIndex}`,
      );
    }
    if (series.shots !== input.expectedSeriesShotLimit) {
      throw new Error(
        `Recovery shot limit ${input.expectedSeriesShotLimit} does not match ${input.stageIndex}:${input.seriesIndex}`,
      );
    }
  };

  const startQualificationRecovery = async (input: StartQualificationRecoveryTransportInput) => {
    assertQualificationRecoveryPosition(input);
    const result = await mqttService.startQualificationRecovery(input);
    return { ...result, action: 'start-qualification-recovery' as const };
  };

  commandBus.register(StartQualificationRecoveryTransportToken, (input) =>
    runWithControlLock(() => startQualificationRecovery(input)),
  );
  commandBus.register(CancelQualificationRecoveryTransportToken, async (input) => {
    const result = await runWithControlLock(() => mqttService.cancelQualificationRecovery(input));
    return { ...result, action: 'cancel-qualification-recovery' as const };
  });
  commandBus.register(ApplyQualificationRecoveryTransportToken, async (input) => {
    const result = await runWithControlLock(() => mqttService.applyQualificationRecovery(input));
    return { ...result, action: 'apply-qualification-recovery' as const };
  });
  commandBus.register(ApplyQualificationRecoverySettlementTransportToken, async (input) => {
    const result = await runWithControlLock(() => {
      assertQualificationRecoveryPosition(input);
      if (input.expectedRecordedShots !== input.expectedSeriesShotLimit) {
        throw new Error('KEEP_RECORDED_SERIES requires every series shot to be recorded');
      }
      return mqttService.settleQualificationRecovery(input);
    });
    return { ...result, action: 'settle-qualification-recovery' as const };
  });
}

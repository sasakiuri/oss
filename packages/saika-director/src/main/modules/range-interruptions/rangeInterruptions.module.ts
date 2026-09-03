import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { rangeInterruptionsContract } from '@/shared/ipc/contracts';

import { RangeInterruptionService } from './application/RangeInterruptionService';
import { QualificationRecoveryExecutionService } from './application/QualificationRecoveryExecutionService';
import { QualificationRecoverySettlementService } from './application/QualificationRecoverySettlementService';
import {
  ApplyQualificationRecoveryTransportToken,
  CancelQualificationRecoveryTransportToken,
  StartQualificationRecoveryTransportToken,
} from './domain/IQualificationRecoveryExecutionTransport';
import { ApplyQualificationRecoverySettlementTransportToken } from './domain/IQualificationRecoverySettlementTransport';
import { SqliteQualificationRecoveryExecutionRepository } from './infra/SqliteQualificationRecoveryExecutionRepository';
import { SqliteQualificationRecoverySettlementRepository } from './infra/SqliteQualificationRecoverySettlementRepository';

export const rangeInterruptionsModule: ModuleDefinition<
  'database' | 'eventBus' | 'commandBus' | 'ipcRouter' | 'rangeInterruptionRepository' | 'competitionTypeRegistry'
> = {
  name: 'rangeInterruptions',
  deps: [
    'database',
    'eventBus',
    'commandBus',
    'ipcRouter',
    'rangeInterruptionRepository',
    'competitionTypeRegistry',
  ] as const,
  register({ database, eventBus, commandBus, ipcRouter, rangeInterruptionRepository, competitionTypeRegistry }) {
    const executionRepository = new SqliteQualificationRecoveryExecutionRepository(database);
    const executionService = new QualificationRecoveryExecutionService(
      rangeInterruptionRepository,
      executionRepository,
      {
        start: (input) => commandBus.execute(StartQualificationRecoveryTransportToken, input),
        cancel: (input) => commandBus.execute(CancelQualificationRecoveryTransportToken, input),
        apply: (input) => commandBus.execute(ApplyQualificationRecoveryTransportToken, input),
      },
    );
    const settlementRepository = new SqliteQualificationRecoverySettlementRepository(database);
    const settlementService = new QualificationRecoverySettlementService(
      rangeInterruptionRepository,
      settlementRepository,
      executionRepository,
      {
        apply: (input) => commandBus.execute(ApplyQualificationRecoverySettlementTransportToken, input),
      },
    );
    const service = new RangeInterruptionService(
      rangeInterruptionRepository,
      competitionTypeRegistry,
      executionRepository,
      settlementRepository,
    );
    eventBus.on('QualificationRecoveryStateObserved', (event) => executionService.observeState(event.state));
    eventBus.on('QualificationRecoveryShotObserved', (event) => executionService.observeShot(event.shot));
    ipcRouter.register(rangeInterruptionsContract, {
      listAll: () => service.listAll(),
      listByScope: (scope) => service.listByScope(scope),
      getById: ({ caseId }) => service.getById(caseId),
      create: (input) => service.create(input),
      linkScope: (input) => service.linkScope(input),
      appendEntry: (input) => service.appendEntry(input),
      recordTargetRecovery: (input) => service.recordTargetRecovery(input),
      recordCommandBatch: (input) => service.recordCommandBatch(input),
      recordQualificationTimedTargetRecoveryDecision: (input) =>
        service.recordQualificationTimedTargetRecoveryDecision(input),
      startQualificationRecoveryExecution: async (input) => {
        await executionService.start(input);
        return service.getById(input.caseId);
      },
      cancelQualificationRecoveryExecution: async (input) => {
        await executionService.cancel(input);
        return service.getById(input.caseId);
      },
      adjudicateQualificationRecoveryExecution: async (input) => {
        await executionService.adjudicate(input);
        return service.getById(input.caseId);
      },
      applyQualificationRecoverySettlement: async (input) => {
        await settlementService.apply(input);
        return service.getById(input.caseId);
      },
    });
  },
};

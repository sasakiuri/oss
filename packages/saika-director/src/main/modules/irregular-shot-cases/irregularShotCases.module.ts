import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { irregularShotCasesContract } from '@/shared/ipc/contracts';

import { IrregularShotCaseService } from './application/IrregularShotCaseService';

export const irregularShotCasesModule: ModuleDefinition<
  | 'queryBus'
  | 'ipcRouter'
  | 'irregularShotCaseRepository'
  | 'competitionShotJournal'
  | 'rangeIncidentReportRepository'
  | 'scoringDecisionRepository'
  | 'competitionTypeRegistry'
> = {
  name: 'irregularShotCases',
  deps: [
    'queryBus',
    'ipcRouter',
    'irregularShotCaseRepository',
    'competitionShotJournal',
    'rangeIncidentReportRepository',
    'scoringDecisionRepository',
    'competitionTypeRegistry',
  ] as const,
  register({
    queryBus,
    ipcRouter,
    irregularShotCaseRepository,
    competitionShotJournal,
    rangeIncidentReportRepository,
    scoringDecisionRepository,
    competitionTypeRegistry,
  }) {
    const service = new IrregularShotCaseService(
      queryBus,
      irregularShotCaseRepository,
      competitionShotJournal,
      rangeIncidentReportRepository,
      scoringDecisionRepository,
      competitionTypeRegistry,
    );
    ipcRouter.register(irregularShotCasesContract, {
      list: (input) => service.list(input),
      create: (input) => service.create(input),
      addEvidence: (input) => service.addEvidence(input),
      appendEntry: (input) => service.appendEntry(input),
    });
  },
};

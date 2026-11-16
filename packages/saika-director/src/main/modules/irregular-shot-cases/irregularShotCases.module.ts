import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { irregularShotCasesContract } from '@/shared/ipc/contracts';

import { IrregularShotCaseService } from './application/IrregularShotCaseService';

export const irregularShotCasesModule = defineModule({
  name: 'irregularShotCases',
  deps: [
    'queryBus',
    'ipcRouter',
    'irregularShotCaseRepository',
    'competitionShotJournal',
    'rangeIncidentReportRepository',
    'scoringDecisionRepository',
    'competitionTypeRegistry',
  ],
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
});

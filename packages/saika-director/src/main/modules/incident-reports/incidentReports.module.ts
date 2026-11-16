import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { incidentReportsContract } from '@/shared/ipc/contracts';

import { IncidentReportService } from './application/IncidentReportService';

export const incidentReportsModule = defineModule({
  name: 'incidentReports',
  deps: ['queryBus', 'ipcRouter', 'rangeIncidentReportRepository', 'scoringDecisionRepository'],
  register({ queryBus, ipcRouter, rangeIncidentReportRepository, scoringDecisionRepository }) {
    const service = new IncidentReportService(queryBus, rangeIncidentReportRepository, scoringDecisionRepository);
    ipcRouter.register(incidentReportsContract, {
      listByEvent: ({ eventId }) => service.listByEvent(eventId),
      getById: ({ reportId }) => service.getById(reportId),
      create: (input) => service.create(input),
      appendEntry: (input) => service.appendEntry(input),
    });
  },
});

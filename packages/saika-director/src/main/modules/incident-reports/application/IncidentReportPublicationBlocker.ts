import type { IResultPublicationBlocker } from '@/main/modules/result-publication';
import { getActiveScoringDecisions, type IScoringDecisionRepository } from '@/main/modules/scoring-decisions';

import { inspectIncidentReportCoverage, REPORT_REQUIRED_DECISION_TYPES } from '../domain/IncidentReportCoverage';
import type { IRangeIncidentReportRepository } from '../domain/IRangeIncidentReportRepository';

export class IncidentReportPublicationBlocker implements IResultPublicationBlocker {
  constructor(
    private readonly reports: IRangeIncidentReportRepository,
    private readonly decisions: IScoringDecisionRepository,
    private readonly requiredTypes: ReadonlySet<string> = REPORT_REQUIRED_DECISION_TYPES,
  ) {}
  getIssues(eventId: string, resultScope: 'QUALIFICATION' | 'FINAL'): readonly string[] {
    const reports = this.reports.findReportsByEvent(eventId);
    const coverage = inspectIncidentReportCoverage(
      getActiveScoringDecisions(this.decisions.findByEventId(eventId, resultScope)),
      reports,
      this.reports.findEntriesByReportIds(reports.map((report) => report.id)),
      this.requiredTypes,
    );
    return coverage.uncovered.map(
      ({ decision, coverageIssue }) =>
        `Scoring decision ${decision.id} (${decision.type}) needs a current Range Incident Report: ${coverageIssue.toLowerCase().replaceAll('_', ' ')}`,
    );
  }
}

import { isRangeIncidentReportVoided, type IRangeIncidentReportRepository } from '@/main/modules/incident-reports';
import { getActiveScoringDecisions, type IScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import type { IResultPublicationBlocker } from '@/main/modules/result-publication';

import type { IIrregularShotCaseRepository } from '../domain/IIrregularShotCaseRepository';
import { irregularShotCaseStatus } from '../domain/IrregularShotCase';

export class IrregularShotPublicationBlocker implements IResultPublicationBlocker {
  constructor(
    private readonly repository: IIrregularShotCaseRepository,
    private readonly incidentReports: IRangeIncidentReportRepository,
    private readonly decisions: IScoringDecisionRepository,
  ) {}

  getIssues(eventId: string, resultScope: 'QUALIFICATION' | 'FINAL'): readonly string[] {
    return [...this.getCaseIssues(eventId, resultScope).values()].flat();
  }

  /** Case-addressable projection used by operational UI without weakening the generic blocker port. */
  getCaseIssues(eventId: string, resultScope: 'QUALIFICATION' | 'FINAL'): ReadonlyMap<string, readonly string[]> {
    const values = this.repository.findCasesByEvent(eventId, resultScope);
    const entries = this.repository.findEntries(values.map((value) => value.id));
    const activeDecisionIds = new Set(
      getActiveScoringDecisions(this.decisions.findByEventId(eventId, resultScope)).map((decision) => decision.id),
    );
    const issues = new Map<string, string[]>();
    for (const value of values) {
      const caseIssues: string[] = [];
      const history = entries.get(value.id) ?? [];
      const status = irregularShotCaseStatus(history);
      if (status === 'OPEN' || status === 'REFERRED') {
        caseIssues.push(`Irregular shot case ${value.id} is unresolved`);
        issues.set(value.id, caseIssues);
        continue;
      }
      if (status !== 'RESOLVED' && status !== 'CLOSED') continue;
      const resolution = [...history].reverse().find((entry) => entry.type === 'RESOLVED');
      if (!resolution?.incidentReportId) {
        caseIssues.push(`Irregular shot case ${value.id} has no current Range Incident Report`);
        issues.set(value.id, caseIssues);
        continue;
      }
      const report = this.incidentReports.findReportById(resolution.incidentReportId);
      const reportEntries = report
        ? (this.incidentReports.findEntriesByReportIds([report.id]).get(report.id) ?? [])
        : [];
      if (!report || report.eventId !== eventId || isRangeIncidentReportVoided(reportEntries)) {
        caseIssues.push(`Irregular shot case ${value.id} references an unavailable Range Incident Report`);
      }
      if (resolution.scoringDecisionIds.some((id) => !activeDecisionIds.has(id))) {
        caseIssues.push(`Irregular shot case ${value.id} references a revoked scoring decision`);
      }
      if (caseIssues.length > 0) issues.set(value.id, caseIssues);
    }
    return issues;
  }
}

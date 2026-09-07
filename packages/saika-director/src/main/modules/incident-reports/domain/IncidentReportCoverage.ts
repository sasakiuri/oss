import type { ScoringDecision } from '@/main/modules/scoring-decisions';

import type { RangeIncidentReport } from './RangeIncidentReport';
import { isRangeIncidentReportVoided, type RangeIncidentReportEntry } from './RangeIncidentReportEntry';

export const REPORT_REQUIRED_DECISION_TYPES: ReadonlySet<string> = new Set([
  'DEDUCTION',
  'ANNUL_SHOT',
  'MARK_MISS',
  'WARNING',
  'DISQUALIFICATION',
  'MALFUNCTION',
  'EXTRA_TIME',
  'REPEAT_SHOT',
  'REPEAT_SERIES',
]);
export type IncidentReportCoverageIssue = 'MISSING_REFERENCE' | 'REPORT_NOT_FOUND' | 'REPORT_VOIDED';
export function normalizeIncidentReportSerial(value: string): string {
  return value.trim().toUpperCase();
}

/** Shared by the IR ledger and publication review; callers supply only current scoring decisions. */
export function inspectIncidentReportCoverage(
  activeDecisions: readonly ScoringDecision[],
  reports: readonly RangeIncidentReport[],
  entriesByReport: ReadonlyMap<string, readonly RangeIncidentReportEntry[]>,
  requiredTypes: ReadonlySet<string> = REPORT_REQUIRED_DECISION_TYPES,
) {
  const requiredDecisions = activeDecisions.filter((decision) => requiredTypes.has(decision.type));
  const reportsBySerial = new Map(
    reports.map((report) => [normalizeIncidentReportSerial(report.serialNumber), report]),
  );
  const uncovered: { decision: ScoringDecision; coverageIssue: IncidentReportCoverageIssue }[] = [];
  for (const decision of requiredDecisions) {
    const reference = decision.incidentReportNumber;
    const report = reference ? reportsBySerial.get(normalizeIncidentReportSerial(reference)) : undefined;
    if (!reference) uncovered.push({ decision, coverageIssue: 'MISSING_REFERENCE' });
    else if (!report) uncovered.push({ decision, coverageIssue: 'REPORT_NOT_FOUND' });
    else if (isRangeIncidentReportVoided(entriesByReport.get(report.id) ?? []))
      uncovered.push({ decision, coverageIssue: 'REPORT_VOIDED' });
  }
  return { requiredDecisions, uncovered };
}

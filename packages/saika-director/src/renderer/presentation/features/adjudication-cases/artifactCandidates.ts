import type {
  AdjudicationCaseDto,
  FinalRecoveryCaseDto,
  ProtestCaseDto,
  RangeIncidentReportDto,
  RangeInterruptionCaseDto,
  ScoringDecisionDto,
  TargetExaminationCaseDto,
} from '@/shared/ipc/contracts';

/** An official record of the event that a case file can link. */
export interface ArtifactCandidate {
  key: string;
  type: AdjudicationCaseDto['links'][number]['artifactType'];
  id: string;
  relation: AdjudicationCaseDto['links'][number]['relation'];
  label: string;
}

/** The event's official records a case file can link, in the order the link selector lists them. */
export function artifactCandidates(records: {
  readonly reports: readonly RangeIncidentReportDto[];
  readonly interruptions: readonly RangeInterruptionCaseDto[];
  readonly examinations: readonly TargetExaminationCaseDto[];
  readonly decisions: readonly ScoringDecisionDto[];
  readonly protests: readonly ProtestCaseDto[];
  readonly recoveries: readonly FinalRecoveryCaseDto[];
}): ArtifactCandidate[] {
  return [
    ...records.reports.map((report) => ({
      key: `RANGE_INCIDENT_REPORT:${report.id}`,
      type: 'RANGE_INCIDENT_REPORT' as const,
      id: report.id,
      relation: 'REPORT' as const,
      label: `IR ${report.serialNumber} · ${report.athleteName ?? 'General range incident'}`,
    })),
    ...records.interruptions.map((interruption) => ({
      key: `RANGE_INTERRUPTION:${interruption.id}`,
      type: 'RANGE_INTERRUPTION' as const,
      id: interruption.id,
      relation: 'RELATED' as const,
      label: `${interruption.cause} · ${interruption.summary}`,
    })),
    ...records.examinations.map((examination) => ({
      key: `TARGET_EXAMINATION:${examination.id}`,
      type: 'TARGET_EXAMINATION' as const,
      id: examination.id,
      relation: 'EVIDENCE' as const,
      label: `${examination.issueKind} · ${examination.summary}`,
    })),
    ...records.decisions.map((decision) => ({
      key: `SCORING_DECISION:${decision.id}`,
      type: 'SCORING_DECISION' as const,
      id: decision.id,
      relation: 'DECISION' as const,
      label: `${decision.type} · ${decision.publicRemark}`,
    })),
    ...records.protests.map((protest) => ({
      key: `PROTEST:${protest.id}`,
      type: 'PROTEST' as const,
      id: protest.id,
      relation: 'PROTEST' as const,
      label: `${protest.kind} · ${protest.subject}`,
    })),
    ...records.recoveries.map((recovery) => ({
      key: `FINAL_RECOVERY:${recovery.id}`,
      type: 'FINAL_RECOVERY' as const,
      id: recovery.id,
      relation: 'RECOVERY' as const,
      label: `${recovery.incidentType} · ${recovery.summary}`,
    })),
  ];
}

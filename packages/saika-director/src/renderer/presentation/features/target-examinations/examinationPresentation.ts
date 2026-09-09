import type {
  TargetExaminationCaseDto,
  TargetExaminationEntryTypeDto,
  TargetExaminationEvidenceTypeDto,
  TargetExaminationIssueKindDto,
  TargetExaminationScopePayload,
} from '@/shared/ipc/contracts';

export const ISSUE_OPTIONS: ReadonlyArray<{
  value: TargetExaminationIssueKindDto;
  label: string;
  ruleReferences: string;
}> = [
  { value: 'SIGHTING_COMPLAINT', label: 'Sighting complaint', ruleReferences: 'ISSF 6.10.5, 6.10.8' },
  { value: 'NO_SHOT_INDICATION', label: 'No shot indication', ruleReferences: 'ISSF 6.10.8, 6.10.9.3' },
  { value: 'UNEXPECTED_ZERO', label: 'Unexpected zero in Final', ruleReferences: 'ISSF 6.17.1.8' },
  { value: 'SCORE_VALUE_PROTEST', label: 'Shot-value protest', ruleReferences: 'ISSF 6.10.7, 6.10.8' },
  {
    value: 'PAPER_OR_RUBBER_FAILURE',
    label: 'Paper or rubber failure',
    ruleReferences: 'ISSF 6.10.6, 6.10.8',
  },
  { value: 'SINGLE_TARGET_FAILURE', label: 'Single target failure', ruleReferences: 'ISSF 6.10.9.2' },
  { value: 'RANGE_TARGET_FAILURE', label: 'Range target failure', ruleReferences: 'ISSF 6.10.9.1' },
  { value: 'OTHER', label: 'Other target issue', ruleReferences: 'ISSF 6.10.8' },
];

export const EVIDENCE_OPTIONS: ReadonlyArray<{ value: TargetExaminationEvidenceTypeDto; label: string }> = [
  { value: 'CONTROL_SHEET', label: 'Control sheet' },
  { value: 'BACKING_CARD', label: 'Backing card' },
  { value: 'BACKING_TARGET', label: 'Backing target' },
  { value: 'WITNESS_STRIP', label: 'Witness strip' },
  { value: 'RUBBER_BAND', label: 'Rubber band' },
  { value: 'RANGE_INCIDENT_REPORT', label: 'Range Incident Report' },
  { value: 'EST_LOG_PRINT', label: 'EST LOG print' },
  { value: 'EST_COMPUTER_RECORD', label: 'EST computer record' },
  { value: 'TARGET_FACE', label: 'Target face or frame' },
  { value: 'OTHER', label: 'Other evidence' },
];

export function entryOptions(
  examination: TargetExaminationCaseDto,
): Array<{ value: TargetExaminationEntryTypeDto; label: string }> {
  if (examination.status === 'CLOSED') {
    return [
      { value: 'REOPENED', label: 'Reopen case and reinstate hold' },
      { value: 'VOID', label: 'Void case' },
    ];
  }
  return [
    { value: 'NOTE', label: 'Note' },
    { value: 'DECISION', label: 'Jury / RTS decision' },
    examination.evidenceHoldActive
      ? { value: 'HOLD_RELEASED', label: 'Release evidence hold' }
      : { value: 'HOLD_REINSTATED', label: 'Reinstate evidence hold' },
    ...(examination.evidenceHoldActive ? [] : [{ value: 'CLOSED' as const, label: 'Close case' }]),
    { value: 'VOID', label: 'Void case' },
  ];
}

export function defaultEntryRule(type: TargetExaminationEntryTypeDto, examination: TargetExaminationCaseDto): string {
  if (type === 'HOLD_RELEASED') return 'ISSF 6.10.8.3';
  if (type === 'DECISION') return examination.ruleReferences;
  return '';
}

export function uniqueScopes(scopes: readonly TargetExaminationScopePayload[]): TargetExaminationScopePayload[] {
  const seen = new Set<string>();
  return scopes.filter((scope) => {
    const key = `${scope.scopeType}:${scope.scopeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function statusLabel(examination: TargetExaminationCaseDto): string {
  if (examination.status === 'VOID') return 'Void';
  if (examination.evidenceHoldActive) return 'Hold active';
  return examination.status === 'CLOSED' ? 'Closed' : 'Hold released';
}

export function statusClass(examination: TargetExaminationCaseDto): string {
  if (examination.status === 'VOID') return 'text-vscode-error';
  if (examination.evidenceHoldActive) return 'text-vscode-warning';
  return 'text-vscode-success';
}

export function formatEnum(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}

export function toLocalInputValue(value: Date): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

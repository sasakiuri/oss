import type {
  ChampionshipOfficialRoleDto,
  RecordCodeDto,
  RecordResultBasisDto,
  ResultsBookWorkspaceDto,
} from '@/shared/ipc/contracts';

export type EligibleRecordResult = ResultsBookWorkspaceDto['eligibleRecordResults'][number];
export type RecordClaim = ResultsBookWorkspaceDto['recordClaims'][number];
export type RecordEntryType = RecordClaim['entries'][number]['type'];

export const OFFICIAL_ROLES: readonly ChampionshipOfficialRoleDto[] = [
  'TECHNICAL_DELEGATE',
  'RTS_JURY_CHAIR',
  'COMPETITION_JURY_CHAIR',
  'EQUIPMENT_CONTROL_JURY_CHAIR',
  'RANGE_JURY_CHAIR',
  'RTS_OFFICER',
  'RANGE_OFFICER',
  'ORGANIZING_COMMITTEE',
  'OTHER',
];

export const RECORD_CODES: readonly RecordCodeDto[] = [
  'WR',
  'QWR',
  'EWR',
  'EQWR',
  'WRJ',
  'QWRJ',
  'EWRJ',
  'EQWRJ',
  'OR',
  'EOR',
  'QOR',
  'EQOR',
];

export const RECORD_RESULT_BASES: readonly { value: RecordResultBasisDto; label: string }[] = [
  { value: 'QUALIFICATION_OR_ELIMINATION', label: 'Qualification / Elimination total' },
  { value: 'FINAL', label: 'Final result' },
  { value: 'RECOGNIZED_NO_FINAL_TOTAL', label: 'Recognized non-Olympic event total (no Final)' },
];

/** Identifies an eligible result across the Qualification and Final scopes. */
export function recordResultKey(result: EligibleRecordResult): string {
  return `${result.resultScope}:${result.resultId}`;
}

export function recordSubjectLabel(subjectKind: EligibleRecordResult['subjectKind']) {
  if (subjectKind === 'MIXED_TEAM') return 'Mixed Team';
  if (subjectKind === 'TEAM') return 'Team';
  return 'Individual';
}

/** A decimal score as entered, in tenths. */
export function scoreX10(value: string): number {
  return Math.round(Number(value) * 10);
}

export function roleLabel(role: ChampionshipOfficialRoleDto): string {
  return role
    .split('_')
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(' ');
}

export function recordBasisLabel(basis: RecordResultBasisDto): string {
  return RECORD_RESULT_BASES.find((item) => item.value === basis)?.label ?? basis;
}

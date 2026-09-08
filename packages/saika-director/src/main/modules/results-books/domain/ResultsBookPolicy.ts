export const CHAMPIONSHIP_OFFICIAL_ROLES = [
  'TECHNICAL_DELEGATE',
  'RTS_JURY_CHAIR',
  'COMPETITION_JURY_CHAIR',
  'EQUIPMENT_CONTROL_JURY_CHAIR',
  'RANGE_JURY_CHAIR',
  'RTS_OFFICER',
  'RANGE_OFFICER',
  'ORGANIZING_COMMITTEE',
  'OTHER',
] as const;
export type ChampionshipOfficialRole = (typeof CHAMPIONSHIP_OFFICIAL_ROLES)[number];

export const RECORD_CODES = [
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
] as const;
export type RecordCode = (typeof RECORD_CODES)[number];
export const RECORD_RESULT_BASES = ['QUALIFICATION_OR_ELIMINATION', 'FINAL', 'RECOGNIZED_NO_FINAL_TOTAL'] as const;
export type RecordResultBasis = (typeof RECORD_RESULT_BASES)[number];
export type RecordClaimStatus = 'DRAFT' | 'TD_CONFIRMED' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'VOID';

export interface ActiveChampionshipOfficial {
  readonly appointmentId: string;
  readonly role: ChampionshipOfficialRole;
  readonly officialName: string;
  readonly officialActorId?: string | null;
  readonly organization: string | null;
}

export interface RecordClaimEntryLike {
  readonly type: 'TD_CONFIRMED' | 'SUBMITTED' | 'TECHNICAL_COMMITTEE_VERIFIED' | 'REJECTED' | 'REOPENED' | 'VOID';
}

export function isResultsBookCertifier(role: ChampionshipOfficialRole): boolean {
  return role === 'TECHNICAL_DELEGATE' || role.endsWith('_JURY_CHAIR');
}

export function requiredResultsBookSigners(
  officials: readonly ActiveChampionshipOfficial[],
): readonly ActiveChampionshipOfficial[] {
  return officials.filter((official) => isResultsBookCertifier(official.role));
}

export function assertRequiredCertificationRoles(officials: readonly ActiveChampionshipOfficial[]): void {
  if (!officials.some((official) => official.role === 'TECHNICAL_DELEGATE')) {
    throw new Error('At least one active Technical Delegate is required');
  }
  if (!officials.some((official) => official.role.endsWith('_JURY_CHAIR'))) {
    throw new Error('At least one active Jury Chairman is required');
  }
}

export function recordClaimStatus(entries: readonly RecordClaimEntryLike[]): RecordClaimStatus {
  let status: RecordClaimStatus = 'DRAFT';
  for (const entry of entries) {
    if (entry.type === 'TD_CONFIRMED') status = 'TD_CONFIRMED';
    else if (entry.type === 'SUBMITTED') status = 'SUBMITTED';
    else if (entry.type === 'TECHNICAL_COMMITTEE_VERIFIED') status = 'VERIFIED';
    else if (entry.type === 'REJECTED') status = 'REJECTED';
    else if (entry.type === 'REOPENED') status = 'DRAFT';
    else if (entry.type === 'VOID') status = 'VOID';
  }
  return status;
}

export function assertRecordCode(input: {
  code: RecordCode;
  resultScope: 'QUALIFICATION' | 'FINAL';
  resultBasis: RecordResultBasis;
  scoreX10: number;
  benchmarkScoreX10: number;
  olympicGamesConfirmed: boolean;
}): void {
  const qualificationCode = ['QWR', 'EQWR', 'QWRJ', 'EQWRJ', 'QOR', 'EQOR'].includes(input.code);
  if (qualificationCode !== (input.resultBasis === 'QUALIFICATION_OR_ELIMINATION')) {
    throw new Error(`${input.code} does not match the selected ISSF record result basis`);
  }
  if (input.resultBasis === 'QUALIFICATION_OR_ELIMINATION' && input.resultScope !== 'QUALIFICATION') {
    throw new Error('Qualification or Elimination record results require a Qualification result source');
  }
  if (input.resultBasis === 'FINAL' && input.resultScope !== 'FINAL') {
    throw new Error('Final record results require a Final result source');
  }
  if (input.resultBasis === 'RECOGNIZED_NO_FINAL_TOTAL') {
    if (input.resultScope !== 'QUALIFICATION') {
      throw new Error('A recognized event total without a Final requires the complete non-Final result source');
    }
    if (!['WR', 'EWR', 'WRJ', 'EWRJ'].includes(input.code)) {
      throw new Error(`${input.code} cannot be used for a recognized non-Olympic event total without a Final`);
    }
  }
  const olympicCode = ['OR', 'EOR', 'QOR', 'EQOR'].includes(input.code);
  if (olympicCode && !input.olympicGamesConfirmed) {
    throw new Error('Olympic record codes require explicit confirmation that this is the Olympic Games');
  }
  const equalled = input.code.startsWith('E');
  if (equalled && input.scoreX10 !== input.benchmarkScoreX10) {
    throw new Error(`${input.code} requires a score equal to the reference record`);
  }
  if (!equalled && input.scoreX10 <= input.benchmarkScoreX10) {
    throw new Error(`${input.code} requires a score exceeding the reference record`);
  }
}

export function assertRecordTransition(status: RecordClaimStatus, next: RecordClaimEntryLike['type']): void {
  if (status === 'VOID' || (status === 'VERIFIED' && next !== 'VOID')) {
    throw new Error(`A ${status.toLowerCase()} record claim is final`);
  }
  if (next === 'TD_CONFIRMED' && status !== 'DRAFT') throw new Error('Only a draft claim can be confirmed by a TD');
  if (next === 'SUBMITTED' && status !== 'TD_CONFIRMED')
    throw new Error('TD confirmation is required before submission');
  if (next === 'TECHNICAL_COMMITTEE_VERIFIED' && status !== 'SUBMITTED') {
    throw new Error('Only a submitted record claim can be verified');
  }
  if (next === 'REJECTED' && status !== 'SUBMITTED') throw new Error('Only a submitted record claim can be rejected');
  if (next === 'REOPENED' && status !== 'REJECTED') throw new Error('Only a rejected record claim can be reopened');
}

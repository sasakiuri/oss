import type { PostCompetitionEquipmentCheckDto } from '@/shared/ipc/contracts';

export type SelectionBasis = PostCompetitionEquipmentCheckDto['selectionBasis'];
export type Outcome = Extract<
  PostCompetitionEquipmentCheckDto['entries'][number],
  { type: 'TEST_RECORDED' }
>['outcome'];
export type ConfirmerRole = Extract<
  PostCompetitionEquipmentCheckDto['entries'][number],
  { type: 'FAILURE_CONFIRMED' }
>['confirmerRole'];

export const selectionOptions: ReadonlyArray<{ value: SelectionBasis; label: string; guidance: string }> = [
  { value: 'RANDOM_DRAW', label: 'General random draw', guidance: 'ISSF 6.7.9.1' },
  {
    value: 'TARGETED_CREDIBLE_EVIDENCE',
    label: 'Targeted — credible evidence',
    guidance: 'ISSF 6.7.9.4; document the credible evidence without sensitive detail',
  },
  {
    value: 'QUALIFICATION_FINALIST_TOP_10',
    label: 'Qualification — likely finalists/top 10',
    guidance: 'ISSF 6.7.9.5 and 8.7.7; officials verify the eligible set',
  },
  {
    value: 'PISTOL_TRIGGER_RANDOM_DRAW',
    label: 'Pistol trigger random draw',
    guidance: 'ISSF 8.4.2.3; record the number of attempts during the test',
  },
];

export function selectionLabel(basis: SelectionBasis): string {
  return selectionOptions.find((option) => option.value === basis)?.label ?? basis;
}

/** A test or non-report can be recorded until a result exists. */
export function canRecordTest(check: PostCompetitionEquipmentCheckDto): boolean {
  return check.status === 'SELECTED' || check.status === 'NOTIFIED';
}

/** A failed test or a non-report waits for a Jury confirmation. */
export function confirmationPending(check: PostCompetitionEquipmentCheckDto): boolean {
  return check.status === 'FAILED_PENDING_CONFIRMATION' || check.status === 'DID_NOT_REPORT_PENDING_CONFIRMATION';
}

/** A check can be voided until a failure or non-report is confirmed. */
export function canVoid(check: PostCompetitionEquipmentCheckDto): boolean {
  return !['FAILED_CONFIRMED', 'DID_NOT_REPORT_CONFIRMED', 'VOIDED'].includes(check.status);
}

export function entryLabel(entry: PostCompetitionEquipmentCheckDto['entries'][number]): string {
  switch (entry.type) {
    case 'NOTICE_ISSUED':
      return `Written notice ${entry.noticeReference} issued by ${entry.officialName}`;
    case 'TEST_RECORDED':
      return `${entry.outcome.replaceAll('_', ' ')} recorded by ${entry.performedBy}`;
    case 'FAILURE_CONFIRMED':
      return `Failure confirmed by ${entry.confirmedBy} (${entry.confirmerRole.replaceAll('_', ' ')})`;
    case 'CHECK_VOIDED':
      return `Voided by ${entry.officialName}`;
  }
}

/** Replaces the changed checks in the list, newest selection first. */
export function mergeChecks(
  current: PostCompetitionEquipmentCheckDto[],
  changed: PostCompetitionEquipmentCheckDto[],
): PostCompetitionEquipmentCheckDto[] {
  const changedById = new Map(changed.map((check) => [check.id, check]));
  const unchanged = current.filter((check) => !changedById.has(check.id));
  return [...changed, ...unchanged].sort((left, right) => right.selectedAt.localeCompare(left.selectedAt));
}

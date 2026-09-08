import type { OfficialSigningEvidence } from '../../official-signing';

export type ResultApprovalEntryType = 'APPROVAL' | 'REVOCATION';
export type ResultApprovalScope = 'QUALIFICATION' | 'FINAL';

export interface ResultListApprovalTarget {
  eventId: string;
  resultScope: ResultApprovalScope;
  snapshotRevision: string;
  requiredIndividualChecks: number;
  requiredTeamChecks: number;
  checkIds: readonly string[];
}

/** Append-only RTS Jury sign-off or an explicit revocation of one sign-off. */
export class ResultListApprovalEntry {
  private constructor(
    readonly id: string,
    readonly eventId: string,
    readonly resultScope: ResultApprovalScope,
    readonly type: ResultApprovalEntryType,
    readonly snapshotRevision: string,
    readonly requiredIndividualChecks: number,
    readonly requiredTeamChecks: number,
    readonly checkIds: readonly string[],
    readonly statement: string,
    readonly officialName: string,
    readonly recordedAt: Date,
    readonly reversesApprovalId: string | null,
    readonly signingEvidence: OfficialSigningEvidence | null,
  ) {
    Object.freeze(this.checkIds);
    Object.freeze(this);
  }

  static createApproval(
    target: ResultListApprovalTarget & {
      statement: string;
      officialName: string;
      recordedAt?: Date;
      signingEvidence?: OfficialSigningEvidence;
    },
  ): ResultListApprovalEntry {
    validateTarget(target);
    validateText(target.statement, 'statement');
    validateText(target.officialName, 'officialName');
    return new ResultListApprovalEntry(
      crypto.randomUUID(),
      target.eventId,
      target.resultScope,
      'APPROVAL',
      target.snapshotRevision,
      target.requiredIndividualChecks,
      target.requiredTeamChecks,
      [...target.checkIds],
      target.statement.trim(),
      target.officialName.trim(),
      validDate(target.recordedAt),
      null,
      target.signingEvidence ? Object.freeze({ ...target.signingEvidence }) : null,
    );
  }

  static createRevocation(
    approval: ResultListApprovalEntry,
    props: { reason: string; officialName: string; recordedAt?: Date; signingEvidence?: OfficialSigningEvidence },
  ): ResultListApprovalEntry {
    if (approval.type !== 'APPROVAL') throw new Error('Only an approval can be revoked');
    validateText(props.reason, 'reason');
    validateText(props.officialName, 'officialName');
    return new ResultListApprovalEntry(
      crypto.randomUUID(),
      approval.eventId,
      approval.resultScope,
      'REVOCATION',
      approval.snapshotRevision,
      approval.requiredIndividualChecks,
      approval.requiredTeamChecks,
      [...approval.checkIds],
      props.reason.trim(),
      props.officialName.trim(),
      validDate(props.recordedAt),
      approval.id,
      props.signingEvidence ? Object.freeze({ ...props.signingEvidence }) : null,
    );
  }

  static reconstruct(props: {
    id: string;
    eventId: string;
    resultScope: ResultApprovalScope;
    type: ResultApprovalEntryType;
    snapshotRevision: string;
    requiredIndividualChecks: number;
    requiredTeamChecks: number;
    checkIds: readonly string[];
    statement: string;
    officialName: string;
    recordedAt: Date;
    reversesApprovalId: string | null;
    signingEvidence?: OfficialSigningEvidence | null;
  }): ResultListApprovalEntry {
    return new ResultListApprovalEntry(
      props.id,
      props.eventId,
      props.resultScope,
      props.type,
      props.snapshotRevision,
      props.requiredIndividualChecks,
      props.requiredTeamChecks,
      [...props.checkIds],
      props.statement,
      props.officialName,
      new Date(props.recordedAt.getTime()),
      props.reversesApprovalId,
      props.signingEvidence ? Object.freeze({ ...props.signingEvidence }) : null,
    );
  }
}

export function getActiveResultListApprovals(entries: readonly ResultListApprovalEntry[]): ResultListApprovalEntry[] {
  const revoked = new Set(
    entries
      .filter((entry) => entry.type === 'REVOCATION' && entry.reversesApprovalId !== null)
      .map((entry) => entry.reversesApprovalId as string),
  );
  return entries.filter((entry) => entry.type === 'APPROVAL' && !revoked.has(entry.id));
}

function validateTarget(target: ResultListApprovalTarget): void {
  validateText(target.eventId, 'eventId');
  if (!/^[a-f0-9]{64}$/.test(target.snapshotRevision)) {
    throw new Error('snapshotRevision must be a SHA-256 digest');
  }
  if (!Number.isInteger(target.requiredIndividualChecks) || target.requiredIndividualChecks < 0) {
    throw new Error('requiredIndividualChecks must be non-negative');
  }
  if (!Number.isInteger(target.requiredTeamChecks) || target.requiredTeamChecks < 0) {
    throw new Error('requiredTeamChecks must be non-negative');
  }
  if (
    new Set(target.checkIds).size !== target.checkIds.length ||
    target.checkIds.some((id) => id.trim().length === 0)
  ) {
    throw new Error('checkIds must be unique and non-empty');
  }
}

function validateText(value: string, name: string): void {
  if (value.trim().length === 0) throw new Error(`${name} is required`);
}

function validDate(value: Date | undefined): Date {
  const date = value ?? new Date();
  if (!Number.isFinite(date.getTime())) throw new Error('recordedAt must be valid');
  return new Date(date.getTime());
}

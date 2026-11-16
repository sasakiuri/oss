import type {
  AppendFinalRecoveryEntryPayload,
  CreateFinalRecoveryCasePayload,
  FinalRecoveryCaseDto,
} from '@/shared/ipc/contracts';

/** Binds the athlete or team the malfunction allowance of a case counts against. */
export interface BindAllowanceSubjectPayload {
  readonly caseId: string;
  readonly subject: NonNullable<FinalRecoveryCaseDto['allowanceSubject']>;
  readonly officialName: string;
  readonly statement: string;
}

/**
 * Commands of the Final recovery workspace. One busy flag and one error cover the queries and every command.
 * `onSaved` runs after the list shows the saved case and before the busy flag clears; it lets a form clear its draft.
 * Each resolves `true` when the command succeeded.
 */
export interface FinalRecoveryCommands {
  readonly create: (payload: CreateFinalRecoveryCasePayload, onSaved: () => void) => Promise<boolean>;
  readonly bindAllowanceSubject: (payload: BindAllowanceSubjectPayload) => Promise<boolean>;
  readonly appendEntry: (payload: AppendFinalRecoveryEntryPayload, onSaved: () => void) => Promise<boolean>;
}

import type {
  AddTargetExaminationEvidencePayload,
  AppendTargetExaminationEntryPayload,
  CreateTargetExaminationCasePayload,
  LinkTargetExaminationScopePayload,
} from '@/shared/ipc/contracts';

export interface TargetExaminationLaneOption {
  laneId: string;
  label: string;
  firingPointNumber: number | null;
  athleteName?: string;
}

/** A true result means the command succeeded in the current workspace visit. */
export interface TargetExaminationCommands {
  create: (input: CreateTargetExaminationCasePayload) => Promise<boolean>;
  addEvidence: (input: AddTargetExaminationEvidencePayload) => Promise<boolean>;
  appendEntry: (input: AppendTargetExaminationEntryPayload) => Promise<boolean>;
  linkScope: (input: LinkTargetExaminationScopePayload) => Promise<boolean>;
}

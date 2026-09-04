export type SafetyStopAuditOperation = 'ACTIVATE' | 'CLEAR';

export interface SafetyStopLaneOutcome {
  readonly laneId: string;
  readonly status: 'done' | 'error' | 'timeout';
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly acknowledgedAt: Date | null;
}

export type SafetyStopFirearmCondition =
  'UNLOADED_SAFETY_FLAG_INSERTED' | 'UNLOADED_ACTION_OPEN' | 'NO_FIREARM_PRESENT';

export interface SafetyStopLaneClearance {
  readonly id: string;
  readonly laneId: string;
  readonly participantId: string | null;
  readonly participantName: string | null;
  readonly athleteConfirmationStatus: 'CONFIRMED' | 'NOT_APPLICABLE';
  readonly athleteConfirmedBy: string | null;
  readonly notApplicableReason: string | null;
  readonly firearmCondition: SafetyStopFirearmCondition;
  readonly personnelClear: true;
  readonly verifiedBy: string;
  readonly verificationNote: string | null;
  readonly verifiedAt: Date;
  readonly recordedAt: Date;
  readonly ruleReferences: readonly string[];
}

export interface SafetyStopAuditEntry {
  readonly id: string;
  readonly safetyStopId: string;
  readonly operation: SafetyStopAuditOperation;
  readonly targetLaneIds: readonly string[];
  readonly success: boolean;
  readonly reason: string;
  readonly officialName: string;
  readonly occurredAt: Date;
  readonly recordedAt: Date;
  readonly laneOutcomes: readonly SafetyStopLaneOutcome[];
  readonly laneClearances: readonly SafetyStopLaneClearance[];
}

export interface ISafetyStopAuditJournal {
  append(entry: SafetyStopAuditEntry): void;
  find(safetyStopId?: string): SafetyStopAuditEntry[];
}

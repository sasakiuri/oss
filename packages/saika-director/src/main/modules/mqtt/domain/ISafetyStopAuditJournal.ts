export type SafetyStopAuditOperation = 'ACTIVATE' | 'CLEAR';

export interface SafetyStopLaneOutcome {
  readonly laneId: string;
  readonly status: 'done' | 'error' | 'timeout';
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly acknowledgedAt: Date | null;
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
}

export interface ISafetyStopAuditJournal {
  append(entry: SafetyStopAuditEntry): void;
  find(safetyStopId?: string): SafetyStopAuditEntry[];
}

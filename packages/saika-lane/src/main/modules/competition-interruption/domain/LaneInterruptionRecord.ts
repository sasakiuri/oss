export const LANE_INTERRUPTION_STATUSES = ['PAUSED', 'RESUME_PENDING', 'SIGHTING', 'RUNNING_MATCH'] as const;

export type LaneInterruptionStatus = (typeof LANE_INTERRUPTION_STATUSES)[number];

export interface LaneInterruptionRecordProps {
  competitionId: string;
  interruptionId: string;
  status: LaneInterruptionStatus;
  pausedAt: Date;
  capturedAt: Date;
  capturedRemainingSeconds: number;
  capturedTotalSeconds: number;
  resumeAt?: Date;
  authorizedRemainingSeconds?: number;
  unlimitedSightingShots?: boolean;
  updatedAt?: Date;
}

/** Durable, independent state for one Lane interruption command sequence. */
export class LaneInterruptionRecord {
  private constructor(
    readonly competitionId: string,
    readonly interruptionId: string,
    readonly status: LaneInterruptionStatus,
    readonly pausedAt: Date,
    readonly capturedAt: Date,
    readonly capturedRemainingSeconds: number,
    readonly capturedTotalSeconds: number,
    readonly resumeAt: Date | null,
    readonly authorizedRemainingSeconds: number | null,
    readonly unlimitedSightingShots: boolean | null,
    readonly updatedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: LaneInterruptionRecordProps): LaneInterruptionRecord {
    validateStatus(props.status);
    return new LaneInterruptionRecord(
      requiredText(props.competitionId, 'competitionId'),
      requiredText(props.interruptionId, 'interruptionId'),
      props.status,
      validDate(props.pausedAt, 'pausedAt'),
      validDate(props.capturedAt, 'capturedAt'),
      nonNegativeInteger(props.capturedRemainingSeconds, 'capturedRemainingSeconds'),
      nonNegativeInteger(props.capturedTotalSeconds, 'capturedTotalSeconds'),
      props.resumeAt ? validDate(props.resumeAt, 'resumeAt') : null,
      props.authorizedRemainingSeconds === undefined
        ? null
        : nonNegativeInteger(props.authorizedRemainingSeconds, 'authorizedRemainingSeconds'),
      props.unlimitedSightingShots ?? null,
      validDate(props.updatedAt ?? new Date(), 'updatedAt'),
    );
  }

  static reconstruct(props: {
    competitionId: string;
    interruptionId: string;
    status: LaneInterruptionStatus;
    pausedAt: Date;
    capturedAt: Date;
    capturedRemainingSeconds: number;
    capturedTotalSeconds: number;
    resumeAt: Date | null;
    authorizedRemainingSeconds: number | null;
    unlimitedSightingShots: boolean | null;
    updatedAt: Date;
  }): LaneInterruptionRecord {
    return LaneInterruptionRecord.create({
      ...props,
      resumeAt: props.resumeAt ?? undefined,
      authorizedRemainingSeconds: props.authorizedRemainingSeconds ?? undefined,
      unlimitedSightingShots: props.unlimitedSightingShots ?? undefined,
    });
  }
}

function validateStatus(value: LaneInterruptionStatus): void {
  if (!LANE_INTERRUPTION_STATUSES.includes(value)) throw new Error('status is invalid');
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be non-negative`);
  return value;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

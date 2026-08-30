// SPDX-License-Identifier: MIT

export type LaneSafetyStopStatus = 'STOPPED' | 'CLEAR';

export interface LaneSafetyTimerSnapshot {
  readonly competitionId: string;
  readonly remainingSeconds: number;
  readonly totalSeconds: number;
  readonly frozenAt: Date;
}

export interface LaneSafetyStopStateProps {
  safetyStopId: string;
  status: LaneSafetyStopStatus;
  reason: string;
  stoppedBy: string;
  stoppedAt: Date;
  timerSnapshot?: LaneSafetyTimerSnapshot | null;
  clearedBy?: string | null;
  clearanceReason?: string | null;
  clearedAt?: Date | null;
}

/** Durable projection of the independent Lane safety latch. */
export class LaneSafetyStopState {
  private constructor(
    readonly safetyStopId: string,
    readonly status: LaneSafetyStopStatus,
    readonly reason: string,
    readonly stoppedBy: string,
    readonly stoppedAt: Date,
    readonly timerSnapshot: LaneSafetyTimerSnapshot | null,
    readonly clearedBy: string | null,
    readonly clearanceReason: string | null,
    readonly clearedAt: Date | null,
  ) {
    Object.freeze(this.timerSnapshot);
    Object.freeze(this);
  }

  static create(props: LaneSafetyStopStateProps): LaneSafetyStopState {
    const status = props.status;
    if (status !== 'STOPPED' && status !== 'CLEAR') throw new Error('Safety stop status is invalid');
    const stoppedAt = validDate(props.stoppedAt, 'stoppedAt');
    const timerSnapshot = props.timerSnapshot
      ? Object.freeze({
          competitionId: requiredText(props.timerSnapshot.competitionId, 'competitionId'),
          remainingSeconds: nonNegativeInteger(props.timerSnapshot.remainingSeconds, 'remainingSeconds'),
          totalSeconds: nonNegativeInteger(props.timerSnapshot.totalSeconds, 'totalSeconds'),
          frozenAt: validDate(props.timerSnapshot.frozenAt, 'frozenAt'),
        })
      : null;
    const clearedAt = props.clearedAt ? validDate(props.clearedAt, 'clearedAt') : null;
    const clearedBy = nullableText(props.clearedBy);
    const clearanceReason = nullableText(props.clearanceReason);
    if (status === 'CLEAR' && (!clearedAt || !clearedBy || !clearanceReason)) {
      throw new Error('Cleared safety stop requires clearance evidence');
    }

    return new LaneSafetyStopState(
      requiredText(props.safetyStopId, 'safetyStopId'),
      status,
      requiredText(props.reason, 'reason'),
      requiredText(props.stoppedBy, 'stoppedBy'),
      stoppedAt,
      timerSnapshot,
      clearedBy,
      clearanceReason,
      clearedAt,
    );
  }

  withTimerSnapshot(snapshot: LaneSafetyTimerSnapshot): LaneSafetyStopState {
    if (this.status !== 'STOPPED') throw new Error('Cannot freeze a cleared safety stop');
    return LaneSafetyStopState.create({ ...this, timerSnapshot: snapshot });
  }

  clear(input: { clearedBy: string; clearanceReason: string; clearedAt: Date }): LaneSafetyStopState {
    if (this.status === 'CLEAR') return this;
    return LaneSafetyStopState.create({
      ...this,
      status: 'CLEAR',
      clearedBy: input.clearedBy,
      clearanceReason: input.clearanceReason,
      clearedAt: input.clearedAt,
    });
  }
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function nullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized || null;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}

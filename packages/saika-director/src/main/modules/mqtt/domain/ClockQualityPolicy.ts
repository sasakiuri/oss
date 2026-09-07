export type ClockQualityMode = 'DISABLED' | 'ADVISORY' | 'REQUIRED';
export type ClockQualityStatus = 'DISABLED' | 'GOOD' | 'DEGRADED' | 'UNAVAILABLE';

export interface ClockProbeTimestamps {
  readonly directorSentAtMs: number;
  readonly laneReceivedAtMs: number;
  readonly laneSentAtMs: number;
  readonly directorReceivedAtMs: number;
}

export interface ClockQualityAssessment {
  readonly policyId: string;
  readonly mode: ClockQualityMode;
  readonly status: ClockQualityStatus;
  readonly offsetMilliseconds: number | null;
  readonly roundTripMilliseconds: number | null;
  readonly uncertaintyMilliseconds: number | null;
  readonly sampledAt: string;
  readonly maxAbsoluteOffsetMilliseconds: number;
  readonly maxUncertaintyMilliseconds: number;
  readonly maxSampleAgeMilliseconds: number;
  readonly usableForTimedCommands: boolean;
  readonly guidance: string;
}

export interface IClockQualityPolicy {
  readonly mode: ClockQualityMode;
  assess(timestamps: ClockProbeTimestamps, sampledAt?: Date): ClockQualityAssessment;
  unavailable(sampledAt?: Date, guidance?: string): ClockQualityAssessment;
  isUsable(assessment: ClockQualityAssessment, now?: Date): boolean;
}

export interface ClockQualityPolicyOptions {
  mode?: ClockQualityMode;
  maxAbsoluteOffsetMilliseconds?: number;
  maxUncertaintyMilliseconds?: number;
  maxSampleAgeMilliseconds?: number;
}

/**
 * Operational clock-quality policy. Thresholds are installation policy, not
 * ISSF scoring rules, and can be replaced without changing the MQTT protocol.
 */
export class ClockQualityPolicy implements IClockQualityPolicy {
  readonly mode: ClockQualityMode;
  private readonly maxAbsoluteOffsetMilliseconds: number;
  private readonly maxUncertaintyMilliseconds: number;
  private readonly maxSampleAgeMilliseconds: number;

  constructor(options: ClockQualityPolicyOptions = {}) {
    this.mode = options.mode ?? 'ADVISORY';
    this.maxAbsoluteOffsetMilliseconds = positiveInteger(options.maxAbsoluteOffsetMilliseconds ?? 250, 'offset');
    this.maxUncertaintyMilliseconds = positiveInteger(options.maxUncertaintyMilliseconds ?? 100, 'uncertainty');
    this.maxSampleAgeMilliseconds = positiveInteger(options.maxSampleAgeMilliseconds ?? 300_000, 'sample age');
  }

  assess(timestamps: ClockProbeTimestamps, sampledAt = new Date()): ClockQualityAssessment {
    for (const [name, value] of Object.entries(timestamps)) {
      if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
    }
    const roundTripMilliseconds = Math.max(
      0,
      timestamps.directorReceivedAtMs -
        timestamps.directorSentAtMs -
        (timestamps.laneSentAtMs - timestamps.laneReceivedAtMs),
    );
    const offsetMilliseconds =
      (timestamps.laneReceivedAtMs -
        timestamps.directorSentAtMs +
        (timestamps.laneSentAtMs - timestamps.directorReceivedAtMs)) /
      2;
    const uncertaintyMilliseconds = roundTripMilliseconds / 2;
    const good =
      Math.abs(offsetMilliseconds) <= this.maxAbsoluteOffsetMilliseconds &&
      uncertaintyMilliseconds <= this.maxUncertaintyMilliseconds;
    const status: ClockQualityStatus = this.mode === 'DISABLED' ? 'DISABLED' : good ? 'GOOD' : 'DEGRADED';
    const assessment = this.base(sampledAt, status, {
      offsetMilliseconds,
      roundTripMilliseconds,
      uncertaintyMilliseconds,
      guidance:
        status === 'GOOD'
          ? 'Lane and Director clocks are within the configured operational tolerance.'
          : status === 'DISABLED'
            ? 'Clock-quality enforcement is disabled; the measurement is retained for diagnostics.'
            : 'Check system time synchronization or network latency before relying on firing-window timestamps.',
    });
    return { ...assessment, usableForTimedCommands: this.isUsable(assessment, sampledAt) };
  }

  unavailable(sampledAt = new Date(), guidance = 'No valid Lane clock sample is available.'): ClockQualityAssessment {
    const status: ClockQualityStatus = this.mode === 'DISABLED' ? 'DISABLED' : 'UNAVAILABLE';
    const assessment = this.base(sampledAt, status, {
      offsetMilliseconds: null,
      roundTripMilliseconds: null,
      uncertaintyMilliseconds: null,
      guidance,
    });
    return { ...assessment, usableForTimedCommands: this.isUsable(assessment, sampledAt) };
  }

  isUsable(assessment: ClockQualityAssessment, now = new Date()): boolean {
    if (this.mode !== 'REQUIRED') return true;
    const age = now.getTime() - Date.parse(assessment.sampledAt);
    return assessment.status === 'GOOD' && age >= 0 && age <= this.maxSampleAgeMilliseconds;
  }

  private base(
    sampledAt: Date,
    status: ClockQualityStatus,
    values: Pick<
      ClockQualityAssessment,
      'offsetMilliseconds' | 'roundTripMilliseconds' | 'uncertaintyMilliseconds' | 'guidance'
    >,
  ): ClockQualityAssessment {
    if (!Number.isFinite(sampledAt.getTime())) throw new Error('sampledAt must be valid');
    return {
      policyId: 'SAIKA-CLOCK-QUALITY-V1',
      mode: this.mode,
      status,
      ...values,
      sampledAt: sampledAt.toISOString(),
      maxAbsoluteOffsetMilliseconds: this.maxAbsoluteOffsetMilliseconds,
      maxUncertaintyMilliseconds: this.maxUncertaintyMilliseconds,
      maxSampleAgeMilliseconds: this.maxSampleAgeMilliseconds,
      usableForTimedCommands: false,
    };
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Clock quality ${name} must be a positive integer`);
  return value;
}

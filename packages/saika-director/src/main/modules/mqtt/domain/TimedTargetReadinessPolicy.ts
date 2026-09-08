import type { CompetitionStartIssue } from '@/main/shared-infra/operations/CompetitionStartReadiness';

type Mode = 'DISABLED' | 'ADVISORY' | 'REQUIRED';
export interface TimedTargetReadinessSettings {
  readonly windowEnforcement: Mode;
  readonly boundedShotTiming: Mode;
  readonly physicalSignals: Mode;
}

/** Consumer-owned facts: no dependency on the transport, device adapter or settings store. */
export interface TimedTargetReadinessFacts {
  readonly connected: boolean;
  readonly reportedAt?: string;
  readonly enforcementMode?: Mode;
  readonly shotTiming?: {
    readonly mode: 'BOUNDED' | 'TIMESTAMP';
    readonly maximumReceiptDelayMilliseconds: number | null;
    readonly clockUncertaintyMilliseconds: number | null;
  };
  readonly physicalActuation?: 'INTEGRATED' | 'NOT_INTEGRATED';
  readonly physicalFeedback?: 'INTEGRATED' | 'NOT_INTEGRATED';
}

export interface ITimedTargetReadinessPolicy {
  assess(laneId: string, facts: TimedTargetReadinessFacts, now?: Date): readonly CompetitionStartIssue[];
}

export class TimedTargetReadinessPolicy implements ITimedTargetReadinessPolicy {
  constructor(
    private readonly readSettings: () => TimedTargetReadinessSettings = () => ({
      windowEnforcement: 'ADVISORY',
      boundedShotTiming: 'ADVISORY',
      physicalSignals: 'ADVISORY',
    }),
  ) {}

  assess(laneId: string, facts: TimedTargetReadinessFacts, now = new Date()): readonly CompetitionStartIssue[] {
    const settings = this.readSettings();
    const age = facts.reportedAt ? now.getTime() - Date.parse(facts.reportedAt) : NaN;
    // The Lane heartbeat is sent every minute; two missed heartbeats plus 30 seconds expire it.
    const current = facts.connected && age >= 0 && age <= 150_000;
    const timing = facts.shotTiming;
    const measured = (value: number | null | undefined) =>
      value !== null && value !== undefined && Number.isInteger(value) && value >= 0 && value <= 60_000;
    const checks = [
      {
        mode: settings.windowEnforcement,
        code: 'TIMED_TARGET_ENFORCEMENT',
        ready: current && facts.enforcementMode === 'REQUIRED',
        guidance: 'Enable required firing-window enforcement in Lane.',
      },
      {
        mode: settings.boundedShotTiming,
        code: 'TIMED_TARGET_SHOT_TIMING',
        ready:
          current &&
          timing?.mode === 'BOUNDED' &&
          measured(timing.maximumReceiptDelayMilliseconds) &&
          measured(timing.clockUncertaintyMilliseconds),
        guidance: 'Configure timing review with measured reception-delay and clock-uncertainty bounds in Lane.',
      },
      {
        mode: settings.physicalSignals,
        code: 'TIMED_TARGET_PHYSICAL_SIGNALS',
        ready: current && facts.physicalActuation === 'INTEGRATED' && facts.physicalFeedback === 'INTEGRATED',
        guidance:
          'Use integrated target actuation and feedback, or select an advisory policy when officials operate an external signal system.',
      },
    ];
    return checks
      .filter((check) => check.mode !== 'DISABLED' && !check.ready)
      .map((check) => ({
        code: check.code,
        blocking: check.mode === 'REQUIRED',
        message: `Lane ${laneId}: ${current ? '' : 'A fresh connected hardware report is missing. '}${check.guidance}`,
      }));
  }
}

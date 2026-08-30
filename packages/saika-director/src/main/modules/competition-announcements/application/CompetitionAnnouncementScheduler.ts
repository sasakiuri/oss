import type {
  CompetitionAnnouncementPhase,
  ICompetitionAnnouncementClock,
  ICompetitionAnnouncementPolicyResolver,
  ICompetitionAnnouncementSink,
  RunningCompetitionTimer,
  ScheduledAnnouncementTask,
} from './CompetitionAnnouncementPorts';

interface TimerSchedule {
  readonly timerId: string;
  readonly phase: CompetitionAnnouncementPhase;
  readonly handledWarnings: Set<number>;
  readonly tasks: Map<number, ScheduledAnnouncementTask>;
}

const DEFAULT_MAX_LATENESS_MS = 5_000;

/**
 * Reconciles authoritative timer snapshots with rule-defined reminder points.
 * Repeated snapshots are idempotent; replaced or removed timers cancel their work.
 */
export class CompetitionAnnouncementScheduler {
  private enabled: boolean;
  private latestTimers: readonly RunningCompetitionTimer[] = [];
  private readonly schedules = new Map<string, TimerSchedule>();

  constructor(
    private readonly policyResolver: ICompetitionAnnouncementPolicyResolver,
    private readonly sink: ICompetitionAnnouncementSink,
    private readonly clock: ICompetitionAnnouncementClock,
    enabled = true,
    private readonly maxLatenessMs = DEFAULT_MAX_LATENESS_MS,
  ) {
    if (!Number.isFinite(maxLatenessMs) || maxLatenessMs < 0) {
      throw new Error('maxLatenessMs must be a non-negative finite number');
    }
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.clearSchedules();
      return;
    }
    this.reconcile(this.latestTimers);
  }

  sync(timers: readonly RunningCompetitionTimer[]): void {
    this.latestTimers = [...timers];
    if (!this.enabled) {
      this.clearSchedules();
      return;
    }
    this.reconcile(timers);
  }

  dispose(): void {
    this.latestTimers = [];
    this.clearSchedules();
  }

  private reconcile(timers: readonly RunningCompetitionTimer[]): void {
    const activeCompetitionIds = new Set(timers.map((timer) => timer.competitionId));
    for (const competitionId of this.schedules.keys()) {
      if (!activeCompetitionIds.has(competitionId)) this.clearSchedule(competitionId);
    }

    for (const timer of timers) this.reconcileTimer(timer);
  }

  private reconcileTimer(timer: RunningCompetitionTimer): void {
    const existing = this.schedules.get(timer.competitionId);
    const schedule =
      existing?.timerId === timer.timerId && existing.phase === timer.phase
        ? existing
        : this.replaceSchedule(timer.competitionId, timer.timerId, timer.phase);
    const policy = this.policyResolver.resolve(timer.competitionTypeId, timer.phase);
    const desiredWarnings = new Set(
      (policy?.warningsAtRemainingSeconds ?? []).filter(
        (seconds) => Number.isInteger(seconds) && seconds > 0 && seconds < timer.durationSeconds,
      ),
    );

    for (const [remainingSeconds, task] of schedule.tasks) {
      if (desiredWarnings.has(remainingSeconds)) continue;
      task.cancel();
      schedule.tasks.delete(remainingSeconds);
    }

    const nowMs = this.clock.nowMs();
    for (const remainingSeconds of [...desiredWarnings].sort((a, b) => b - a)) {
      if (schedule.handledWarnings.has(remainingSeconds) || schedule.tasks.has(remainingSeconds)) continue;
      const dueAtMs = timer.startsAtMs + (timer.durationSeconds - remainingSeconds) * 1_000;
      if (dueAtMs < nowMs) {
        // Never replay an official reminder late after an app restart or clock correction.
        schedule.handledWarnings.add(remainingSeconds);
        continue;
      }

      const notifyWhenDue = (): void => {
        const current = this.schedules.get(timer.competitionId);
        if (current !== schedule || current.timerId !== timer.timerId) return;
        const firedAtMs = this.clock.nowMs();
        if (firedAtMs < dueAtMs) {
          // A wall-clock rollback must not make a reminder fire before its absolute deadline.
          current.tasks.set(remainingSeconds, this.clock.schedule(notifyWhenDue, dueAtMs - firedAtMs));
          return;
        }
        current.tasks.delete(remainingSeconds);
        current.handledWarnings.add(remainingSeconds);
        // Do not issue a materially wrong reminder after suspension or a large clock jump.
        if (firedAtMs - dueAtMs > this.maxLatenessMs) return;
        this.sink.publish({
          competitionId: timer.competitionId,
          competitionTypeId: timer.competitionTypeId,
          ...(policy?.rulePackId ? { rulePackId: policy.rulePackId } : {}),
          phase: timer.phase,
          remainingSeconds,
          dueAtMs,
        });
      };
      const task = this.clock.schedule(notifyWhenDue, Math.max(0, dueAtMs - nowMs));
      schedule.tasks.set(remainingSeconds, task);
    }
  }

  private replaceSchedule(competitionId: string, timerId: string, phase: CompetitionAnnouncementPhase): TimerSchedule {
    this.clearSchedule(competitionId);
    const schedule: TimerSchedule = {
      timerId,
      phase,
      handledWarnings: new Set(),
      tasks: new Map(),
    };
    this.schedules.set(competitionId, schedule);
    return schedule;
  }

  private clearSchedule(competitionId: string): void {
    const schedule = this.schedules.get(competitionId);
    if (!schedule) return;
    for (const task of schedule.tasks.values()) task.cancel();
    this.schedules.delete(competitionId);
  }

  private clearSchedules(): void {
    for (const competitionId of [...this.schedules.keys()]) this.clearSchedule(competitionId);
  }
}

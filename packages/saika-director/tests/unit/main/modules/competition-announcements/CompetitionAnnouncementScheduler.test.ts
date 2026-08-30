import { describe, expect, it, vi } from 'vitest';

import {
  CompetitionAnnouncementScheduler,
  type CompetitionAnnouncement,
  type ICompetitionAnnouncementClock,
  type ICompetitionAnnouncementPolicyResolver,
  type RunningCompetitionTimer,
  type ScheduledAnnouncementTask,
} from '@/main/modules/competition-announcements';

class FakeClock implements ICompetitionAnnouncementClock {
  private currentMs = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { dueAtMs: number; callback: () => void }>();

  nowMs(): number {
    return this.currentMs;
  }

  schedule(callback: () => void, delayMs: number): ScheduledAnnouncementTask {
    const id = this.nextId++;
    this.tasks.set(id, { dueAtMs: this.currentMs + delayMs, callback });
    return { cancel: () => this.tasks.delete(id) };
  }

  advanceTo(targetMs: number): void {
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.dueAtMs <= targetMs)
        .sort((a, b) => a[1].dueAtMs - b[1].dueAtMs || a[0] - b[0])[0];
      if (!next) break;
      const [id, task] = next;
      this.tasks.delete(id);
      this.currentMs = task.dueAtMs;
      task.callback();
    }
    this.currentMs = targetMs;
  }

  fireOverdueAt(targetMs: number): void {
    this.currentMs = targetMs;
    for (const [id, task] of [...this.tasks.entries()]
      .filter(([, candidate]) => candidate.dueAtMs <= targetMs)
      .sort((a, b) => a[1].dueAtMs - b[1].dueAtMs || a[0] - b[0])) {
      this.tasks.delete(id);
      task.callback();
    }
  }
}

const policyResolver: ICompetitionAnnouncementPolicyResolver = {
  resolve: (_competitionTypeId, phase) => ({
    rulePackId: 'ISSF:2026:AR60:QUALIFICATION',
    warningsAtRemainingSeconds: phase === 'PREPARATION' ? [30] : [600, 300],
  }),
};

function timer(overrides: Partial<RunningCompetitionTimer> = {}): RunningCompetitionTimer {
  return {
    competitionId: '11111111-1111-4111-8111-111111111111',
    competitionTypeId: 'AR60',
    timerId: 'preparation:0',
    phase: 'PREPARATION',
    startsAtMs: 0,
    durationSeconds: 900,
    ...overrides,
  };
}

describe('CompetitionAnnouncementScheduler', () => {
  it('emits each Rule Pack reminder once across repeated timer snapshots', () => {
    const clock = new FakeClock();
    const publish = vi.fn<(announcement: CompetitionAnnouncement) => void>();
    const scheduler = new CompetitionAnnouncementScheduler(policyResolver, { publish }, clock);
    const runningTimer = timer();

    scheduler.sync([runningTimer]);
    scheduler.sync([runningTimer]);
    clock.advanceTo(869_999);
    expect(publish).not.toHaveBeenCalled();

    clock.advanceTo(870_000);
    scheduler.sync([runningTimer]);
    clock.advanceTo(900_000);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      competitionId: runningTimer.competitionId,
      competitionTypeId: 'AR60',
      rulePackId: 'ISSF:2026:AR60:QUALIFICATION',
      phase: 'PREPARATION',
      remainingSeconds: 30,
      dueAtMs: 870_000,
    });
  });

  it('uses match-specific reminder points in chronological order', () => {
    const clock = new FakeClock();
    const published: CompetitionAnnouncement[] = [];
    const scheduler = new CompetitionAnnouncementScheduler(
      policyResolver,
      { publish: (announcement) => published.push(announcement) },
      clock,
    );

    scheduler.sync([timer({ timerId: 'match:0', phase: 'MATCH', durationSeconds: 4_500 })]);
    clock.advanceTo(4_200_000);

    expect(published.map((announcement) => announcement.remainingSeconds)).toEqual([600, 300]);
  });

  it('cancels reminders when an authoritative timer is replaced', () => {
    const clock = new FakeClock();
    const publish = vi.fn<(announcement: CompetitionAnnouncement) => void>();
    const scheduler = new CompetitionAnnouncementScheduler(policyResolver, { publish }, clock);

    scheduler.sync([timer()]);
    clock.advanceTo(100_000);
    scheduler.sync([timer({ timerId: 'preparation:restart', startsAtMs: 100_000 })]);
    clock.advanceTo(969_999);
    expect(publish).not.toHaveBeenCalled();

    clock.advanceTo(970_000);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[0].dueAtMs).toBe(970_000);
  });

  it('never replays elapsed reminders when enabled or restored late', () => {
    const clock = new FakeClock();
    const publish = vi.fn<(announcement: CompetitionAnnouncement) => void>();
    const scheduler = new CompetitionAnnouncementScheduler(policyResolver, { publish }, clock, false);

    scheduler.sync([timer()]);
    clock.advanceTo(880_000);
    scheduler.setEnabled(true);
    clock.advanceTo(900_000);

    expect(publish).not.toHaveBeenCalled();
  });

  it('suppresses a materially late reminder after system suspension', () => {
    const clock = new FakeClock();
    const publish = vi.fn<(announcement: CompetitionAnnouncement) => void>();
    const scheduler = new CompetitionAnnouncementScheduler(policyResolver, { publish }, clock);

    scheduler.sync([timer()]);
    clock.fireOverdueAt(880_000);
    scheduler.sync([timer()]);

    expect(publish).not.toHaveBeenCalled();
  });

  it('cancels pending work when a competition timer disappears', () => {
    const clock = new FakeClock();
    const publish = vi.fn<(announcement: CompetitionAnnouncement) => void>();
    const scheduler = new CompetitionAnnouncementScheduler(policyResolver, { publish }, clock);

    scheduler.sync([timer()]);
    scheduler.sync([]);
    clock.advanceTo(900_000);

    expect(publish).not.toHaveBeenCalled();
  });
});

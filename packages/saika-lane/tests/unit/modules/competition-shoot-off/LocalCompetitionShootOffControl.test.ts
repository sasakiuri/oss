import { describe, expect, it } from 'vitest';

import { LocalCompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const competitionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const runId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createControl() {
  const values = new Map<string, unknown>();
  const storage = {
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => values.set(key, value),
    delete: (key: string) => values.delete(key),
  } as unknown as ILocalStorage;
  return new LocalCompetitionShootOffControl(storage);
}

describe('LocalCompetitionShootOffControl', () => {
  it('re-arms an unfired logical round with the synchronized time from a retry', () => {
    const control = createControl();
    control.open({
      competitionId,
      runId,
      iteration: 1,
      timerStartAt: '2026-09-02T03:00:00.000Z',
      timerDurationSeconds: 50,
    });

    const retried = control.open({
      competitionId,
      runId,
      iteration: 1,
      timerStartAt: '2026-09-02T03:01:00.000Z',
      timerDurationSeconds: 50,
    });

    expect(retried).toMatchObject({ status: 'OPEN', timerStartAt: '2026-09-02T03:01:00.000Z' });
    expect(control.canAcceptShot(competitionId, new Date('2026-09-02T03:01:25.000Z'))).toBe(true);
  });

  it('never re-arms a round after its physical shot has been recorded', () => {
    const control = createControl();
    control.open({
      competitionId,
      runId,
      iteration: 1,
      timerStartAt: '2026-09-02T03:00:00.000Z',
      timerDurationSeconds: 50,
    });
    control.recordShot(competitionId, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', new Date('2026-09-02T03:00:25.000Z'));

    const retried = control.open({
      competitionId,
      runId,
      iteration: 1,
      timerStartAt: '2026-09-02T03:01:00.000Z',
      timerDurationSeconds: 50,
    });

    expect(retried).toMatchObject({
      status: 'SHOT_RECORDED',
      shotId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      timerStartAt: '2026-09-02T03:00:00.000Z',
    });
    expect(control.canAcceptShot(competitionId, new Date('2026-09-02T03:01:25.000Z'))).toBe(false);
  });
});

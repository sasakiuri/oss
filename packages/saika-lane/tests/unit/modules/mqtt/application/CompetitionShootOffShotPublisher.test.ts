import { describe, expect, it, vi } from 'vitest';

import type {
  CompetitionShootOffWindow,
  ICompetitionShootOffControl,
  ICompetitionShootOffShotOutbox,
} from '@/main/modules/competition-shoot-off';
import { CompetitionShootOffShotPublisher } from '@/main/modules/mqtt/application/CompetitionShootOffShotPublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { CompetitionShootOffShotPayload } from '@/shared/mqtt/CompetitionShootOffShot';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const competitionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const runId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const laneId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const shotId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('CompetitionShootOffShotPublisher', () => {
  it('restores the one-shot guard from the durable outbox after a process interruption', () => {
    const openState: CompetitionShootOffWindow = {
      competitionId,
      runId,
      iteration: 1,
      timerStartAt: '2026-09-02T03:00:00.000Z',
      timerDurationSeconds: 50,
      shotsPerLane: 1,
      status: 'OPEN',
      recordedShotIds: [],
    };
    const recordShot = vi.fn(() => ({ ...openState, status: 'COMPLETE' as const, recordedShotIds: [shotId] }));
    const control = {
      getState: vi.fn(() => openState),
      recordShot,
    } as unknown as ICompetitionShootOffControl;
    const persisted: CompetitionShootOffShotPayload = {
      schemaVersion: 1,
      competitionId,
      runId,
      iteration: 1,
      laneId,
      shotId,
      x: null,
      y: null,
      effectiveScoreX10: 101,
      deviceScoreX10: 101,
      calculatedScoreX10: 101,
      innerTen: false,
      firedAt: '2026-09-02T03:00:25.000Z',
      receivedAt: '2026-09-02T03:00:25.100Z',
      publishedAt: '2026-09-02T03:00:25.200Z',
    };
    const outbox = {
      findByRound: vi.fn(() => [persisted]),
    } as unknown as ICompetitionShootOffShotOutbox;
    const storage = { get: vi.fn(() => laneId) } as unknown as ILocalStorage;
    const eventBus = { on: vi.fn(() => () => undefined) } as unknown as IEventBus;

    new CompetitionShootOffShotPublisher({} as IMqttClientService, eventBus, storage, control, outbox);

    expect(outbox.findByRound).toHaveBeenCalledWith(runId, 1, laneId);
    expect(recordShot).toHaveBeenCalledWith(competitionId, shotId, new Date('2026-09-02T03:00:25.000Z'));
  });
});

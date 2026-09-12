// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';

import { LaneScorePayloadSchema } from '@sasakiuri/saika-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { CompetitionTypeDefinition } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import { AR60_FINAL, BR60S, P25_FINAL, R3P_FINAL } from '@/main/modules/competition/domain/competitionTypes';
import { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import { createMockCompetitionRepository, createMockSessionRepository } from '../../../../helpers/mockDependencies';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

function setup(type: CompetitionTypeDefinition = BR60S) {
  let session = Session.create(Discipline.fromValue(type.discipline));
  let competition = CompetitionState.create(randomUUID(), session.id, type.config)
    .startStage()
    .endStage()
    .advanceToNextStage()
    .startNextSeries();
  const competitions = createMockCompetitionRepository();
  competitions.findActive = vi.fn(async () => competition);
  competitions.findById = vi.fn(async () => competition);
  const sessions = createMockSessionRepository();
  sessions.findById = vi.fn(async () => session);
  const publish = vi.fn().mockResolvedValue(undefined);
  const mqtt = { isConnected: vi.fn(() => true), publish } as unknown as IMqttClientService;
  const events = new TypedEventBus();
  const laneId = randomUUID();
  const storage = { get: () => laneId } as unknown as ILocalStorage;
  const publisher = new LaneScorePublisher(mqtt, events, storage, competitions, sessions);
  return {
    publisher,
    mqtt,
    publish,
    competitions,
    sessions,
    events,
    get session() {
      return session;
    },
    get competition() {
      return competition;
    },
    set competition(value: CompetitionState) {
      competition = value;
    },
    record(score: number, mode = Mode.match(), captureContext = true) {
      session = session.recordShot(
        null,
        new Score(score),
        new Date(),
        undefined,
        false,
        mode,
        captureContext
          ? {
              competitionContext: {
                competitionId: competition.id,
                stageIndex: competition.currentStageIndex,
                seriesIndex: competition.currentSeriesIndex,
              },
            }
          : undefined,
      );
      return session.allShots.at(-1)!;
    },
    async snapshot() {
      await publisher.publishCurrentScore();
      return LaneScorePayloadSchema.parse(JSON.parse(publish.mock.lastCall![1] as string));
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('LaneScorePublisher', () => {
  it('publishes one internally consistent retained snapshot from actual MATCH history', async () => {
    const rig = setup();
    rig.record(90, Mode.sighting());
    rig.record(100);
    rig.record(105);
    const payload = await rig.snapshot();
    expect(payload).toMatchObject({ totalScoreX10: 205, totalShotCount: 2, sessionId: rig.session.id });
    expect(payload.stages[0]!.series[0]).toMatchObject({ shots: [100, 105], seriesTotalX10: 205, isComplete: false });
    expect(rig.publish).toHaveBeenCalledWith(expect.stringContaining('/score'), expect.any(String), {
      qos: 1,
      retain: true,
    });
    expect(rig.sessions.findById).toHaveBeenCalledTimes(1);
  });

  it('keeps two five-shot Final series separate from the Session ten-shot groups', async () => {
    const rig = setup(AR60_FINAL);
    for (let index = 0; index < 5; index++) {
      rig.record(100);
      rig.competition = rig.competition.recordShotInSeries();
    }
    rig.competition = rig.competition.advanceToNextStage().startNextSeries();
    rig.record(105);
    expect(rig.session.allShots.at(-1)!.seriesNumber).toBe(1);
    const payload = await rig.snapshot();
    expect(payload.stages[0]!.series[0]).toMatchObject({ shots: [100, 100, 100, 100, 100], isComplete: true });
    expect(payload.stages[0]!.series[1]).toMatchObject({ shots: [105], isComplete: false });
  });

  it('keeps incomplete and single-shot Final series in their captured competition positions', async () => {
    const rig = setup(AR60_FINAL);
    rig.record(100);
    rig.competition = rig.competition.expireTimer().advanceToNextStage().startNextSeries();
    rig.record(105);
    rig.competition = rig.competition.expireTimer().advanceToNextStage().startNextSeries();
    rig.record(109);
    const payload = await rig.snapshot();
    expect(payload.stages[0]!.series.map((series) => series.shots)).toEqual([[100], [105]]);
    expect(payload.stages[1]!.series[0]!.shots).toEqual([109]);
  });

  it('excludes position-change sighting from the R3P Final MATCH count and totals', async () => {
    const rig = setup(R3P_FINAL);
    for (let index = 0; index < 20; index++) {
      rig.record(100);
      rig.competition = rig.competition.recordShotInSeries();
    }
    expect(rig.competition.currentSeriesConfig.purpose).toBe('POSITION_CHANGE_AND_SIGHTING');
    rig.record(109, Mode.sighting());
    rig.competition = rig.competition.expireTimer().advanceToNextStage().startNextSeries();
    rig.record(105);
    const payload = await rig.snapshot();
    expect(payload).toMatchObject({ totalScoreX10: 2105, totalShotCount: 21 });
    expect(payload.stages[1]!.series[0]!.shots).toEqual([105]);
    expect(payload.stages[0]!.series).toHaveLength(2);
  });

  it('publishes HIT/MISS scores with their original decimal evidence', async () => {
    const rig = setup(P25_FINAL);
    [102, 101, 109, 97, 0].forEach((score) => rig.record(score));
    const payload = await rig.snapshot();
    expect(payload).toMatchObject({ totalScoreX10: 20, totalShotCount: 5, sourceTotalScoreX10: 409 });
    expect(payload.stages[0]!.series[0]).toMatchObject({
      shots: [10, 0, 10, 0, 0],
      sourceShotsX10: [102, 101, 109, 97, 0],
      isComplete: true,
    });
  });

  it('reports unverified historical competition placement without publishing a guessed score', async () => {
    const rig = setup();
    rig.record(100, Mode.match(), false);
    await expect(rig.publisher.publishCurrentScore()).rejects.toThrow('no verified placement');
    expect(rig.publish).not.toHaveBeenCalled();
  });

  it('republishes after SessionReset and ordinary MATCH shots, excluding sighting and isolated evidence', async () => {
    const rig = setup();
    const sighting = rig.record(90, Mode.sighting());
    rig.events.emit({
      type: 'ShotRecorded',
      aggregateId: rig.session.id,
      timestamp: Date.now(),
      shot: sighting,
      scoringMode: 'DECIMAL',
    });
    await Promise.resolve();
    expect(rig.publish).not.toHaveBeenCalled();
    const shot = rig.record(100);
    rig.events.emit({
      type: 'ShotRecorded',
      aggregateId: rig.session.id,
      timestamp: Date.now(),
      shot,
      scoringMode: 'DECIMAL',
      acquisitionContext: { shotDisposition: 'ISOLATED', owner: 'qualification-recovery', referenceId: 'run-1' },
    });
    await Promise.resolve();
    expect(rig.publish).not.toHaveBeenCalled();
    rig.events.emit({
      type: 'ShotRecorded',
      aggregateId: rig.session.id,
      timestamp: Date.now(),
      shot,
      scoringMode: 'DECIMAL',
    });
    await vi.waitFor(() => expect(rig.publish).toHaveBeenCalledTimes(1));
    rig.events.emit({ type: 'SessionReset', aggregateId: rig.session.id, timestamp: Date.now() });
    await vi.waitFor(() => expect(rig.publish).toHaveBeenCalledTimes(2));
  });

  it('publishes a finished competition by ID and includes the final snapshot command ID', async () => {
    const rig = setup();
    rig.record(100);
    const commandId = randomUUID();
    vi.mocked(rig.competitions.findActive).mockResolvedValue(null);
    await rig.publisher.publishCurrentScore(rig.competition.id, commandId);
    const payload = LaneScorePayloadSchema.parse(JSON.parse(rig.publish.mock.lastCall![1] as string));
    expect(payload.finalSnapshotCommandId).toBe(commandId);
    expect(rig.competitions.findById).toHaveBeenCalledWith(rig.competition.id);
  });

  it('serializes snapshots and keeps the publication queue usable after a failure', async () => {
    const rig = setup();
    let release!: () => void;
    rig.publish.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const first = rig.publisher.publishCurrentScore();
    const second = rig.publisher.publishCurrentScore();
    await vi.waitFor(() => expect(rig.publish).toHaveBeenCalledTimes(1));
    release();
    await Promise.all([first, second]);
    rig.publish.mockRejectedValueOnce(new Error('broker unavailable'));
    await expect(rig.publisher.publishCurrentScore()).rejects.toThrow('broker unavailable');
    await expect(rig.publisher.publishCurrentScore()).resolves.toBeUndefined();
  });

  it('does not publish when disconnected or without an active competition', async () => {
    const rig = setup();
    vi.mocked(rig.mqtt.isConnected).mockReturnValue(false);
    await rig.publisher.publishCurrentScore();
    vi.mocked(rig.mqtt.isConnected).mockReturnValue(true);
    vi.mocked(rig.competitions.findActive).mockResolvedValue(null);
    await rig.publisher.publishCurrentScore();
    expect(rig.publish).not.toHaveBeenCalled();
  });
});

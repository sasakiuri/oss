// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';

import { createShotRecordedHandler } from '@/main/modules/competition/application/CompetitionEventHandlers';
import { createSetAthleteTargetModeHandler } from '@/main/modules/competition/application/handlers/SetAthleteTargetModeHandler';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { CompetitionShotPublisher } from '@/main/modules/mqtt/application/CompetitionShotPublisher';
import { LaneCompetitionStatePublisher } from '@/main/modules/mqtt/application/LaneCompetitionStatePublisher';
import { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import { athleteCompetition } from '../../../../helpers/athleteCompetition';
import { createMockCompetitionRepository, createMockSessionRepository } from '../../../../helpers/mockDependencies';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

it('keeps all MQTT publishers silent on selection and retains only Match scores during embedded sighting', async () => {
  let session = Session.create(Discipline.rifle50m());
  let state = CompetitionState.reconstruct({ ...athleteCompetition(), id: randomUUID(), sessionId: session.id });
  const competitions = createMockCompetitionRepository();
  const sessions = createMockSessionRepository();
  vi.mocked(competitions.findActive).mockImplementation(async () => state);
  vi.mocked(competitions.findById).mockImplementation(async () => state);
  vi.mocked(competitions.save).mockImplementation(async (next) => {
    state = next;
  });
  vi.mocked(sessions.findById).mockImplementation(async () => session);
  const events = new TypedEventBus();
  const publish = vi.fn().mockResolvedValue(undefined);
  const mqtt = { isConnected: () => true, publish } as unknown as IMqttClientService;
  const laneId = randomUUID();
  const storage = { get: () => laneId } as unknown as ILocalStorage;
  new CompetitionShotPublisher(mqtt, events, storage, competitions, sessions);
  const scorePublisher = new LaneScorePublisher(mqtt, events, storage, competitions, sessions);
  const statePublisher = new LaneCompetitionStatePublisher(mqtt, events, storage, competitions);
  events.on('ShotRecorded', createShotRecordedHandler({ competitionRepository: competitions, eventBus: events }));
  const context = () => ({
    competitionId: state.id,
    stageIndex: state.currentStageIndex,
    seriesIndex: state.currentSeriesIndex,
  });
  session = session.recordShot(null, new Score(100), new Date(), undefined, false, Mode.match(), {
    competitionContext: { ...context(), seriesIndex: 0 },
  });
  await scorePublisher.publishCurrentScore();
  await statePublisher.publishCurrentState();
  const previousScore = publish.mock.calls.find(([topic]) => topic.endsWith('/score'))![1];
  expect(JSON.parse(publish.mock.calls.find(([topic]) => topic.endsWith('/state'))![1]).phase).toBe('MATCH');
  publish.mockClear();

  const select = createSetAthleteTargetModeHandler(competitions, events, { get: () => null });
  const input = { ...context(), mode: 'SIGHTING' as const };
  const previousSession = session;
  await select(input);
  await select(input);
  await Promise.resolve();
  expect(publish).not.toHaveBeenCalled();
  expect(session).toBe(previousSession);

  session = session.recordShot(null, new Score(90), new Date(), undefined, false, Mode.sighting(), {
    competitionContext: context(),
  });
  events.emit({
    type: 'ShotRecorded',
    scoringMode: session.scoringMode,
    aggregateId: session.id,
    timestamp: Date.now(),
    shot: session.allShots.at(-1)!,
  });
  await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
  const [topic, payload, options] = publish.mock.calls[0]!;
  expect(topic).toMatch(/\/shot$/);
  expect(JSON.parse(payload)).toMatchObject({
    mode: 'SIGHTING',
    scored: true,
    isRecorded: false,
    stageIndex: 1,
    seriesIndex: state.currentSeriesIndex,
  });
  expect(options).toEqual({ qos: 1, retain: false });
  expect(state.seriesShotCount).toBe(0);
  await scorePublisher.publishCurrentScore();
  const sightingScore = JSON.parse(publish.mock.calls.find(([name]) => name.endsWith('/score'))![1]);
  expect({ ...sightingScore, publishedAt: null }).toEqual({ ...JSON.parse(previousScore), publishedAt: null });

  await select({ ...context(), mode: 'MATCH' });
  publish.mockClear();
  session = session.recordShot(null, new Score(100), new Date(), undefined, false, Mode.match(), {
    competitionContext: context(),
  });
  events.emit({
    type: 'ShotRecorded',
    scoringMode: session.scoringMode,
    aggregateId: session.id,
    timestamp: Date.now(),
    shot: session.allShots.at(-1)!,
  });
  await vi.waitFor(() => {
    expect(state.seriesShotCount).toBe(1);
    expect(publish.mock.calls.some(([name]) => name.endsWith('/score'))).toBe(true);
    expect(publish.mock.calls.some(([name]) => name.endsWith('/state'))).toBe(true);
  });
  expect(JSON.parse(publish.mock.calls.find(([name]) => name.endsWith('/shot'))![1])).toMatchObject({
    mode: 'MATCH',
    isRecorded: true,
  });
});

// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPhaseChangedHandler,
  createShotRecordedHandler,
} from '@/main/modules/competition/application/CompetitionEventHandlers';
import { emitPhaseChanged } from '@/main/modules/competition/application/emitPhaseChanged';
import { createAdvanceStageHandler } from '@/main/modules/competition/application/handlers/AdvanceStageHandler';
import { createStartNextSeriesHandler } from '@/main/modules/competition/application/handlers/StartNextSeriesHandler';
import { SessionLifecycleService } from '@/main/modules/competition/application/SessionLifecycleService';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { AR60_FINAL, BR60S, BP60 } from '@/main/modules/competition/domain/competitionTypes';
import { CompetitionRepositoryImpl } from '@/main/modules/competition/infra/CompetitionRepositoryImpl';
import { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { CompetitionSafetyTimerFreezer } from '@/main/modules/safety-stop/infra/CompetitionSafetyTimerFreezer';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import { createMockSessionRepository } from '../../../../helpers/mockDependencies';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({ getLogger: () => ({ error: vi.fn(), debug: vi.fn() }) }));
afterEach(() => vi.useRealTimers());

async function setup(type = BR60S, emitStart = true) {
  vi.useFakeTimers();
  const stored = new Map<string, unknown>();
  const storage = {
    get: (key: string) => stored.get(key),
    set: (key: string, value: unknown) => stored.set(key, value),
    setMany: (values: Record<string, unknown>) =>
      Object.entries(values).forEach(([key, value]) => stored.set(key, value)),
    delete: (key: string) => stored.delete(key),
  } as unknown as ILocalStorage;
  const repository = new CompetitionRepositoryImpl(storage);
  const events = new TypedEventBus();
  const timer = new LaneTimerService(repository, events);
  events.on('PhaseChanged', createPhaseChangedHandler({ competitionRepository: repository, timerService: timer }));
  const state = CompetitionState.create('competition', 'session', type.config)
    .startStage()
    .endStage()
    .advanceToNextStage()
    .startNextSeries();
  await repository.save(state);
  if (emitStart) emitPhaseChanged(events, state, 'STAGE_ENTERED');
  await vi.advanceTimersByTimeAsync(0);
  return {
    timer,
    events,
    repository,
    state,
    shot: createShotRecordedHandler({ competitionRepository: repository, eventBus: events }),
    advance: createAdvanceStageHandler(
      repository,
      new SessionLifecycleService(createMockSessionRepository(), events),
      events,
    ),
    start: createStartNextSeriesHandler(repository, events),
  };
}

describe('stage timer across series commands', () => {
  it.each([BR60S, BP60])(
    'continues the original deadline through series completion and waiting for $id',
    async (type) => {
      const rig = await setup(type);
      await vi.advanceTimersByTimeAsync(600_000);
      for (let index = 0; index < 10; index++) await rig.shot();
      await rig.advance({ competitionId: rig.state.id });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(rig.timer.sample(rig.state.id)).toMatchObject({ running: true, remainingMs: 2070_000 });
      await rig.start({ competitionId: rig.state.id });
      await vi.advanceTimersByTimeAsync(0);
      expect(rig.timer.sample(rig.state.id)).toMatchObject({ running: true, remainingMs: 2070_000 });
      rig.timer.stop();
    },
  );

  it('expires while waiting within the stage, prevents more MATCH fire and allows finishing', async () => {
    const rig = await setup();
    for (let index = 0; index < 10; index++) await rig.shot();
    await rig.advance({ competitionId: rig.state.id });
    await vi.advanceTimersByTimeAsync(2700_000);
    const expired = await rig.repository.findById(rig.state.id);
    expect(expired).toMatchObject({ phase: 'SERIES_COMPLETE', timer: { remainingSeconds: 0 } });
    expect(expired!.canAcceptShot()).toBe(false);
    await expect(rig.start({ competitionId: rig.state.id })).rejects.toThrow();
    await rig.advance({ competitionId: rig.state.id });
    expect((await rig.repository.findById(rig.state.id))!.phase).toBe('FINISHED');
    rig.timer.stop();
  });

  it('retains a stage clock restored without a phase event', async () => {
    const rig = await setup(BR60S, false);
    await rig.timer.resumeAt(rig.state.id, new Date().toISOString(), 2700);
    await vi.advanceTimersByTimeAsync(600_000);
    for (let index = 0; index < 10; index++) await rig.shot();
    await rig.advance({ competitionId: rig.state.id });
    await vi.advanceTimersByTimeAsync(30_000);
    await rig.start({ competitionId: rig.state.id });
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.timer.sample(rig.state.id)).toMatchObject({ remainingMs: 2070_000, running: true });
    rig.timer.stop();
  });

  it('aligns an absolute stage clock received while waiting between series', async () => {
    const rig = await setup();
    const absoluteStart = new Date().toISOString();
    await vi.advanceTimersByTimeAsync(600_000);
    for (let index = 0; index < 10; index++) await rig.shot();
    await rig.advance({ competitionId: rig.state.id });
    await rig.timer.startAt(rig.state.id, absoluteStart, 2700);
    await rig.start({ competitionId: rig.state.id });
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.timer.sample(rig.state.id)).toMatchObject({ remainingMs: 2100_000, running: true });
    rig.timer.stop();
  });

  it('stops an explicitly ended sighting stage', async () => {
    const rig = await setup(BR60S, false);
    const sighting = CompetitionState.create(rig.state.id, rig.state.sessionId, BR60S.config).startStage();
    await rig.repository.save(sighting);
    emitPhaseChanged(rig.events, sighting, 'IDLE');
    await vi.advanceTimersByTimeAsync(60_000);
    const ended = sighting.endStage();
    await rig.repository.save(ended);
    emitPhaseChanged(rig.events, ended, 'ACTIVE');
    expect(rig.timer.sample(sighting.id)).toMatchObject({ running: false });
    rig.timer.stop();
  });

  it('applies an external expiry while waiting and cannot restart the expired stage', async () => {
    const rig = await setup();
    await vi.advanceTimersByTimeAsync(600_000);
    for (let index = 0; index < 10; index++) await rig.shot();
    await rig.advance({ competitionId: rig.state.id });
    await rig.timer.expire(rig.state.id);
    expect(await rig.repository.findById(rig.state.id)).toMatchObject({
      phase: 'SERIES_COMPLETE',
      timer: { remainingSeconds: 0 },
    });
    await expect(rig.start({ competitionId: rig.state.id })).rejects.toThrow();
    rig.timer.stop();
  });

  it('freezes the actual stage time between series before a Safety STOP', async () => {
    const rig = await setup();
    await vi.advanceTimersByTimeAsync(600_000);
    for (let index = 0; index < 10; index++) await rig.shot();
    await rig.advance({ competitionId: rig.state.id });
    const frozen = await new CompetitionSafetyTimerFreezer(rig.repository, rig.timer).freeze();
    expect(frozen).toMatchObject({ competitionId: rig.state.id, remainingSeconds: 2100, totalSeconds: 2700 });
    expect(rig.timer.sample(rig.state.id)).toMatchObject({ remainingMs: 2100_000, running: false });
    await rig.start({ competitionId: rig.state.id });
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.timer.sample(rig.state.id)).toMatchObject({ remainingMs: 2100_000, running: true });
    rig.timer.stop();
  });

  it('grants a fresh duration to a separately timed Final series', async () => {
    const rig = await setup(AR60_FINAL);
    const duration = rig.state.timer.totalSeconds;
    await vi.advanceTimersByTimeAsync(30_000);
    for (let index = 0; index < 5; index++) await rig.shot();
    await rig.advance({ competitionId: rig.state.id });
    await rig.start({ competitionId: rig.state.id });
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.timer.sample(rig.state.id)).toMatchObject({ remainingMs: duration * 1000, running: true });
    rig.timer.stop();
  });
});

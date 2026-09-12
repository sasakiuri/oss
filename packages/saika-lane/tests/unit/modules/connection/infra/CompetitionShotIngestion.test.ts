// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecordShotToken, SwitchModeToken } from '@/main/composition/tokens';
import { createShotRecordedHandler } from '@/main/modules/competition/application/CompetitionEventHandlers';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { AR60_FINAL, BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { CompetitionInterruptionService, type LaneInterruptionRecord } from '@/main/modules/competition-interruption';
import { createShotIngestionHandler } from '@/main/modules/connection/infra/ShotIngestionHandler';
import { resolveCompetitionShotPlacement } from '@/main/modules/mqtt/application/ShotCompetitionPlacement';
import { createRecordShotHandler } from '@/main/modules/session/application/handlers/RecordShotHandler';
import { createSwitchModeHandler } from '@/main/modules/session/application/handlers/SwitchModeHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { ScoreDiscrepancyDetector } from '@/main/modules/session/domain/ScoreDiscrepancyDetector';
import { Session } from '@/main/modules/session/domain/Session';
import { ScoreCalculationServiceImpl } from '@/main/modules/session/infra/ScoreCalculationServiceImpl';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

import {
  createMockCompetitionRepository,
  createMockShotObservationRepository,
} from '../../../../helpers/mockDependencies';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
const close: Array<() => void> = [];
afterEach(() => close.splice(0).forEach((release) => release()));

async function setup(type = BR60S) {
  const db = createSqliteDb(':memory:');
  close.push(() => db.close());
  const sessions = new SqliteSessionRepository(db);
  const session = Session.create(Discipline.fromValue(type.discipline)).resumeMode(Mode.match());
  await sessions.save(session);
  let competition = CompetitionState.create(randomUUID(), session.id, type.config)
    .startStage()
    .endStage()
    .advanceToNextStage()
    .startNextSeries();
  const competitions = createMockCompetitionRepository();
  competitions.findActive = vi.fn(async () => competition);
  competitions.findById = vi.fn(async () => competition);
  competitions.save = vi.fn(async (state) => {
    competition = state;
  });
  const events = new TypedEventBus();
  const commands = new CommandBus();
  commands.register(
    RecordShotToken,
    createRecordShotHandler(sessions, new ScoreCalculationServiceImpl(), events, {
      detect: vi.fn(),
    } as unknown as ScoreDiscrepancyDetector),
  );
  commands.register(SwitchModeToken, createSwitchModeHandler(sessions, events));
  let record: LaneInterruptionRecord | null = null;
  const interruption = new CompetitionInterruptionService(
    {
      findByCompetitionId: () => record,
      save: (value) => {
        record = value;
      },
      delete: () => {
        record = null;
      },
    },
    competitions,
    {
      pause: async () => ({ remainingSeconds: 2100, totalSeconds: 2700 }),
      resumeAt: async () => undefined,
    } as unknown as LaneTimerService,
    commands,
    events,
  );
  let progress = Promise.resolve();
  const recordProgress = createShotRecordedHandler({ competitionRepository: competitions, eventBus: events });
  events.on('ShotRecorded', (event) => {
    progress = recordProgress(event);
  });
  const ingest = createShotIngestionHandler({
    commandBus: commands,
    sessionRepository: sessions,
    competitionRepository: competitions,
    shotObservationRepository: createMockShotObservationRepository(),
    interruptionReader: interruption,
  });
  return {
    sessions,
    session,
    interruption,
    get competition() {
      return competition;
    },
    set competition(value: CompetitionState) {
      competition = value;
    },
    async fire(mode: 'MATCH' | 'SIGHTING' = 'MATCH') {
      await ingest({ x: 1, y: 1, score: 100, timestamp: new Date(), mode });
      await progress;
      return (await sessions.findById(session.id))!;
    },
  };
}

describe('competition shot acquisition and persistence', () => {
  it('keeps authorized recovery sighting out of MATCH score and shot progress until explicit resume', async () => {
    const rig = await setup();
    await rig.fire();
    const interruptionId = randomUUID();
    await rig.interruption.pause({ competitionId: rig.competition.id, interruptionId, pausedAt: new Date() });
    await rig.interruption.resume({
      competitionId: rig.competition.id,
      interruptionId,
      timerStartAt: new Date(),
      authorizedRemainingSeconds: 2100,
      unlimitedSightingShots: true,
    });
    const sighting = await rig.fire('MATCH');
    expect(sighting.mode.value).toBe('SIGHTING');
    expect(sighting.allShots.at(-1)!.mode.value).toBe('SIGHTING');
    expect(sighting.totalScore).toBe(100);
    expect(rig.competition.seriesShotCount).toBe(1);
    await rig.interruption.resumeMatch({ competitionId: rig.competition.id, interruptionId });
    const resumed = await rig.fire('SIGHTING');
    expect(resumed.allShots.at(-1)!.mode.value).toBe('MATCH');
    expect(resumed.totalScore).toBe(200);
    expect(rig.competition.seriesShotCount).toBe(2);
  });

  it('captures series positions before progress changes and retains incomplete boundaries after SQLite reload', async () => {
    const rig = await setup(AR60_FINAL);
    for (let index = 0; index < 3; index++) await rig.fire();
    rig.competition = rig.competition.expireTimer().advanceToNextStage().startNextSeries();
    const reloaded = await rig.fire();
    const latest = reloaded.allShots.at(-1)!;
    expect(latest.seriesNumber).toBe(1);
    expect(latest.competitionContext).toEqual({ competitionId: rig.competition.id, stageIndex: 1, seriesIndex: 1 });
    expect(resolveCompetitionShotPlacement(latest, reloaded.allShots, rig.competition)).toEqual({
      stageIndex: 1,
      seriesIndex: 1,
      shotNumberInSeries: 1,
    });
  });
});

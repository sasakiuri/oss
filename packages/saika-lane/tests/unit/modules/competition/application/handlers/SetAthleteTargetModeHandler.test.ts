// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { createSetAthleteTargetModeHandler } from '@/main/modules/competition/application/handlers/SetAthleteTargetModeHandler';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Session } from '@/main/modules/session/domain/Session';

import { athleteCompetition } from '../../../../../helpers/athleteCompetition';
import {
  createMockCompetitionRepository,
  createMockEventBus,
  createMockSessionRepository,
} from '../../../../../helpers/mockDependencies';

function rig(state = athleteCompetition()) {
  const repository = createMockCompetitionRepository();
  vi.mocked(repository.findActive).mockResolvedValue(state);
  const events = createMockEventBus();
  const sessions = createMockSessionRepository();
  vi.mocked(sessions.findById).mockResolvedValue(Session.create(Discipline.rifle50m()));
  const handler = createSetAthleteTargetModeHandler(repository, events, { get: () => null }, sessions);
  const input = {
    competitionId: state.id,
    stageIndex: state.currentStageIndex,
    seriesIndex: state.currentSeriesIndex,
    mode: 'SIGHTING' as const,
  };
  return { state, repository, events, sessions, handler, input };
}

describe('SetAthleteTargetMode', () => {
  it('persists only the selection and returns its projection before any renderer event', async () => {
    const { state, repository, events, handler, input } = rig();
    const dto = await handler(input);
    const saved = vi.mocked(repository.save).mock.calls[0]![0];
    expect({ ...saved, athleteTargetMode: undefined }).toEqual({ ...state });
    expect(dto).toMatchObject({
      sessionId: state.sessionId,
      currentStageIndex: state.currentStageIndex,
      currentSeriesIndex: state.currentSeriesIndex,
      seriesShotCount: 0,
      athleteTargetControl: { sightingAllowed: true, matchAllowed: true, selected: 'SIGHTING', effective: 'SIGHTING' },
    });
    expect(saved.timer).toBe(state.timer);
    expect(events.emit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: 'AthleteTargetModeChanged',
        newMode: expect.objectContaining({ value: 'SIGHTING' }),
      }),
    );
    expect(vi.mocked(repository.save).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(events.emit).mock.invocationCallOrder[0]!,
    );
  });

  it.each(['competitionId', 'stageIndex', 'seriesIndex'] as const)(
    'rejects stale %s without a write or event',
    async (field) => {
      const r = rig();
      await expect(r.handler({ ...r.input, [field]: field === 'competitionId' ? 'other' : 999 })).rejects.toMatchObject(
        { code: 'ATHLETE_TARGET_CONTEXT_CHANGED' },
      );
      expect(r.repository.save).not.toHaveBeenCalled();
      expect(r.events.emit).not.toHaveBeenCalled();
    },
  );

  it.each(['IDLE', 'SERIES_COMPLETE', 'SERIES_ENTERED', 'STAGE_ENTERED', 'FINISHED'] as const)(
    'rejects phase %s',
    async (phase) => {
      const state = CompetitionState.reconstruct({ ...athleteCompetition(), phase });
      const r = rig(state);
      await expect(r.handler(r.input)).rejects.toMatchObject({ code: 'ATHLETE_TARGET_NOT_ACTIVE' });
      expect(r.repository.save).not.toHaveBeenCalled();
    },
  );

  it('rejects non-athlete series and absent competition', async () => {
    const r = rig(CompetitionState.create('comp', 'session', BR60S.config).startStage());
    await expect(r.handler(r.input)).rejects.toMatchObject({ code: 'ATHLETE_TARGET_NOT_CONTROLLED' });
    vi.mocked(r.repository.findActive).mockResolvedValue(null);
    await expect(r.handler(r.input)).rejects.toMatchObject({ code: 'COMPETITION_NOT_FOUND' });
    expect(r.repository.save).not.toHaveBeenCalled();
  });

  it('allows repeated Match after the cutoff without changing progress or deadline', async () => {
    const r = rig(athleteCompetition().recordShotInSeries().tickTimerBy(12));
    const input = { ...r.input, mode: 'MATCH' as const };
    const first = await r.handler(input);
    vi.mocked(r.repository.findActive).mockResolvedValue(vi.mocked(r.repository.save).mock.calls[0]![0]);
    expect(await r.handler(input)).toEqual(first);
    expect(first).toMatchObject({
      seriesShotCount: 1,
      athleteTargetControl: { sightingAllowed: false, effective: 'MATCH' },
    });
    expect(vi.mocked(r.repository.save).mock.calls[1]![0].timer).toBe(r.state.timer);
    await expect(r.handler(r.input)).rejects.toMatchObject({ code: 'ATHLETE_SIGHTING_CLOSED' });
  });

  it.each(['SIGHTING', 'MATCH'] as const)(
    'rejects %s while official sighting is authorized without sending or saving',
    async (mode) => {
      const r = rig();
      const interruption = LaneInterruptionRecord.create({
        competitionId: r.state.id,
        interruptionId: 'interruption',
        status: 'SIGHTING',
        pausedAt: new Date(),
        capturedAt: new Date(),
        capturedRemainingSeconds: 600,
        capturedTotalSeconds: 1000,
        unlimitedSightingShots: true,
      });
      const handler = createSetAthleteTargetModeHandler(
        r.repository,
        r.events,
        { get: () => interruption },
        r.sessions,
      );
      await expect(handler({ ...r.input, mode })).rejects.toMatchObject({ code: 'ATHLETE_TARGET_OFFICIAL_SIGHTING' });
      expect(r.repository.save).not.toHaveBeenCalled();
      expect(r.events.emit).not.toHaveBeenCalled();
    },
  );

  it('emits no mode event when persistence fails', async () => {
    const r = rig();
    vi.mocked(r.repository.save).mockRejectedValue(new Error('storage failed'));
    await expect(r.handler(r.input)).rejects.toThrow('storage failed');
    expect(r.events.emit).not.toHaveBeenCalled();
  });
});

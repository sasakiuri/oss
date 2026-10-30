// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { resolveCompetitionShotMode } from '@/main/modules/competition/domain/CompetitionShotModePolicy';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { resolveCompetitionTargetMode } from '@/main/modules/competition/domain/CompetitionTargetModePolicy';
import { ALL_COMPETITION_TYPES, R3P_FINAL } from '@/main/modules/competition/domain/competitionTypes';

import { athleteCompetition, selectAthlete } from '../../../../helpers/athleteCompetition';

const resolve = (state: CompetitionState, reported?: 'SIGHTING' | 'MATCH') =>
  resolveCompetitionShotMode(
    state.currentStageConfig,
    state.currentSeriesConfig,
    reported,
    state.seriesShotCount,
    state.athleteTargetMode,
    resolveCompetitionTargetMode(state, [], null).sightingRequired,
  );

describe('athlete target selection', () => {
  it.each([
    'R3P60',
    'R3P60_INDOOR',
    'R3P60_ELIMINATION',
    'R300_3P60',
    'R300_3P60_ELIMINATION',
    'R300_STD60',
    'R300_STD60_ELIMINATION',
    'R3P_FINAL',
  ])('uses Rule Pack position control for %s', (id) => {
    const type = ALL_COMPETITION_TYPES.find((entry) => entry.id === id)!;
    const state = athleteCompetition(type);
    expect(state.currentSeriesConfig).toMatchObject({ targetModeControl: 'ATHLETE', position: 'PRONE' });
    expect(state.athleteTargetMode).toBeUndefined();
    expect(resolve(state)).toEqual({ mode: 'MATCH', nullify: true });
    expect(() => selectAthlete(state, 'MATCH')).toThrow(expect.objectContaining({ code: 'ATHLETE_SIGHTING_REQUIRED' }));
    expect(resolve(state, 'SIGHTING')).toEqual({ mode: 'SIGHTING', nullify: false });
    expect(resolve(selectAthlete(state, 'SIGHTING'), 'MATCH')).toEqual({ mode: 'SIGHTING', nullify: false });
    expect(resolve(selectAthlete(selectAthlete(state, 'SIGHTING'), 'MATCH'), 'SIGHTING')).toEqual({
      mode: 'MATCH',
      nullify: false,
    });
  });

  it('retains selection only across clock updates and selections', () => {
    const state = selectAthlete(athleteCompetition(), 'SIGHTING');
    expect(state.tickTimerBy(1).athleteTargetMode).toBe('SIGHTING');
    expect(state.replaceTimer(30, 60).athleteTargetMode).toBe('SIGHTING');
    expect(selectAthlete(state, 'SIGHTING')).toEqual(state);
    expect(selectAthlete(state, 'MATCH').athleteTargetMode).toBe('MATCH');
  });

  it('closes sighting at the first Match shot even when the device still reports SIGHTING', () => {
    const state = selectAthlete(selectAthlete(athleteCompetition(), 'SIGHTING'), 'MATCH').recordShotInSeries();
    expect(state.seriesShotCount).toBe(1);
    expect(state.athleteTargetMode).toBeUndefined();
    expect(resolve(state, 'SIGHTING')).toEqual({ mode: 'MATCH', nullify: false });
    expect(() => selectAthlete(state, 'SIGHTING')).toThrow(
      expect.objectContaining({ code: 'ATHLETE_SIGHTING_CLOSED' }),
    );
    expect(selectAthlete(state, 'MATCH').seriesShotCount).toBe(1);
  });

  it.each([
    ['record', (s: CompetitionState) => s.recordShotInSeries()],
    ['expiry', (s: CompetitionState) => s.expireTimer()],
    ['reset', (s: CompetitionState) => s.resetToIdle()],
    ['rewind', (s: CompetitionState) => s.rewindToStage(0)],
    ['finish', (s: CompetitionState) => s.finish()],
    ['session replacement', (s: CompetitionState) => s.withSessionId('replacement')],
    ['start stage', (s: CompetitionState) => CompetitionState.reconstruct({ ...s, phase: 'IDLE' }).startStage()],
    [
      'restart stage',
      (s: CompetitionState) =>
        CompetitionState.reconstruct({ ...s, currentStageIndex: 0, currentSeriesIndex: 0 }).restartStage(),
    ],
    [
      'end stage',
      (s: CompetitionState) =>
        CompetitionState.reconstruct({ ...s, currentStageIndex: 0, currentSeriesIndex: 0 }).endStage(),
    ],
    [
      'start series',
      (s: CompetitionState) => CompetitionState.reconstruct({ ...s, phase: 'SERIES_ENTERED' }).startNextSeries(),
    ],
    [
      'advance series',
      (s: CompetitionState) => CompetitionState.reconstruct({ ...s, phase: 'SERIES_COMPLETE' }).advanceToNextStage(),
    ],
    [
      'automatic advance',
      (s: CompetitionState) => CompetitionState.reconstruct({ ...s, seriesShotCount: 9 }).recordShotInSeries(),
    ],
  ] as const)('clears the selection on %s through the transition default', (_label, transition) => {
    expect(
      transition(selectAthlete(selectAthlete(athleteCompetition(), 'SIGHTING'), 'MATCH')).athleteTargetMode,
    ).toBeUndefined();
  });

  it('starts the next position with no choice and always forces final changeover to Sighting', () => {
    let state = athleteCompetition(R3P_FINAL);
    for (let i = 0; i < 10; i++) state = state.recordShotInSeries();
    expect(state.currentSeriesConfig.purpose).toBe('POSITION_CHANGE_AND_SIGHTING');
    expect(state.athleteTargetMode).toBeUndefined();
    expect(resolve(state, 'MATCH')).toEqual({ mode: 'SIGHTING', nullify: false });
    expect(resolve(selectAthlete(state, 'SIGHTING'))).toEqual({ mode: 'SIGHTING', nullify: false });
    expect(() => selectAthlete(state, 'MATCH')).toThrow(expect.objectContaining({ code: 'ATHLETE_MATCH_UNAVAILABLE' }));
  });
});

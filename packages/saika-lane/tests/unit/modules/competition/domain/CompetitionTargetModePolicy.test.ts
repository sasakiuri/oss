// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { createGetCompetitionStateHandler } from '@/main/modules/competition/application/handlers/GetCompetitionStateHandler';
import { resolveCompetitionTargetMode } from '@/main/modules/competition/domain/CompetitionTargetModePolicy';
import { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import { SessionContextCache } from '@/main/modules/connection/infra/SessionContextCache';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';

import { athleteCompetition, selectAthlete } from '../../../../helpers/athleteCompetition';
import {
  createMockCompetitionRepository,
  createMockEventBus,
  createMockSessionRepository,
} from '../../../../helpers/mockDependencies';
import { projectVistaTargetMode } from '../../../../helpers/projectVistaTargetMode';

const cases = [
  {
    label: 'observed Sighting without a Lane choice',
    selection: undefined,
    count: 0,
    status: null,
    unlimited: false,
    mode: 'SIGHTING',
    allowed: [true, true],
  },
  {
    label: 'Lane Match choice',
    selection: 'MATCH',
    count: 0,
    status: null,
    unlimited: false,
    mode: 'MATCH',
    allowed: [true, true],
  },
  {
    label: 'first Match cutoff',
    selection: undefined,
    count: 1,
    status: null,
    unlimited: false,
    mode: 'MATCH',
    allowed: [false, true],
  },
  {
    label: 'official sighting overrides Match choice',
    selection: 'MATCH',
    count: 0,
    status: 'SIGHTING',
    unlimited: true,
    mode: 'SIGHTING',
    allowed: [false, false],
  },
  {
    label: 'official sighting overrides cutoff',
    selection: undefined,
    count: 1,
    status: 'SIGHTING',
    unlimited: true,
    mode: 'SIGHTING',
    allowed: [false, false],
  },
  {
    label: 'pending official sighting',
    selection: 'MATCH',
    count: 0,
    status: 'RESUME_PENDING',
    unlimited: true,
    mode: 'SIGHTING',
    allowed: [false, false],
  },
  {
    label: 'pending normal fire restores observations',
    selection: undefined,
    count: 0,
    status: 'RESUME_PENDING',
    unlimited: false,
    mode: 'SIGHTING',
    allowed: [true, true],
  },
  {
    label: 'resumed normal fire restores observations',
    selection: undefined,
    count: 0,
    status: 'RUNNING_MATCH',
    unlimited: false,
    mode: 'SIGHTING',
    allowed: [true, true],
  },
] as const;

describe('one target-mode policy across consumers', () => {
  it.each(cases)('$label', async ({ selection, count, status, unlimited, mode, allowed }) => {
    let state = athleteCompetition();
    if (count) state = state.recordShotInSeries();
    const session = Session.create(Discipline.rifle50m()).recordShot(
      null,
      new Score(100),
      new Date(),
      undefined,
      false,
      Mode.sighting(),
      {
        competitionContext: {
          competitionId: state.id,
          stageIndex: state.currentStageIndex,
          seriesIndex: state.currentSeriesIndex,
          athleteModeObserved: true,
        },
      },
    );
    state = state.withSessionId(session.id);
    if (selection) state = selectAthlete(state, selection);
    const interruption = status
      ? LaneInterruptionRecord.create({
          competitionId: state.id,
          interruptionId: 'interruption',
          status,
          pausedAt: new Date(),
          capturedAt: new Date(),
          capturedRemainingSeconds: 600,
          capturedTotalSeconds: 1000,
          unlimitedSightingShots: unlimited,
        })
      : null;
    const domain = resolveCompetitionTargetMode(state, session.allShots, interruption);
    expect(domain.effective).toBe(mode);
    expect(domain.athleteTargetControl).toMatchObject({ sightingAllowed: allowed[0], matchAllowed: allowed[1] });
    const competitions = createMockCompetitionRepository();
    vi.mocked(competitions.findActive).mockResolvedValue(state);
    vi.mocked(competitions.findById).mockResolvedValue(state);
    const sessions = createMockSessionRepository();
    vi.mocked(sessions.findById).mockResolvedValue(session);
    const interruptions = { get: () => interruption };
    const dto = await createGetCompetitionStateHandler(
      competitions,
      sessions,
      interruptions,
    )({ competitionId: state.id });
    expect(dto.athleteTargetControl).toEqual(domain.athleteTargetControl);
    expect(dto.athleteTargetControl?.officialSighting).toBe(domain.officialSighting);
    expect(projectVistaTargetMode(state, session, interruption)).toBe(mode === 'MATCH' ? 'match' : 'sighting');
    const cache = new SessionContextCache(createMockEventBus());
    await cache.bootstrap(sessions, competitions, interruptions);
    expect(cache.getContext().mode.value).toBe(mode);
  });
});

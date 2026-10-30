// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { toCompetitionStateDto } from '@/main/modules/competition/application/toCompetitionStateDto';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { AR60 } from '@/main/modules/competition/domain/competitionTypes';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { laneVistaDefinition, projectLaneVista } from '@/main/modules/vista/application/LaneVistaProjection';

import { athleteCompetition } from '../../../../helpers/athleteCompetition';

// The projection is independent of the source's supported-event registration gate.
const definitionSession = Session.create(Discipline.airRifle10m());
const definition = laneVistaDefinition(
  CompetitionState.create('definition', definitionSession.id, AR60.config),
  definitionSession,
)!;
function project(state: CompetitionState, session: Session) {
  return projectLaneVista({
    sourceId: 'lane-1',
    competition: state,
    session,
    definition,
    history: [{ session, stage: state.currentStageIndex, shotContexts: new Map(), shootOffSeries: new Map() }],
    historyComplete: true,
    generation: 'generation',
    revision: 1,
    laneName: 'Lane 1',
    clock: null,
    interruption: null,
    shootOffSeries: null,
  }).participants[0]!.mode;
}

describe('Lane and Vista target mode projection', () => {
  it('shares observed ATHLETE mode, selection, cutoff and override exclusion', () => {
    const state = athleteCompetition();
    const context = {
      competitionId: state.id,
      stageIndex: state.currentStageIndex,
      seriesIndex: state.currentSeriesIndex,
    };
    const session = Session.create(Discipline.rifle50m()).recordShot(
      null,
      new Score(100),
      new Date(),
      undefined,
      false,
      Mode.sighting(),
      {
        competitionContext: { ...context, athleteModeObserved: true },
      },
    );
    expect(toCompetitionStateDto(state, session.allShots).athleteTargetControl?.effective).toBe('SIGHTING');
    expect(project(state, session)).toBe('sighting');
    expect(
      project(
        state.selectAthleteTargetMode(
          {
            competitionId: state.id,
            stageIndex: state.currentStageIndex,
            seriesIndex: state.currentSeriesIndex,
            mode: 'MATCH',
          },
          null,
          session.allShots,
        ),
        session,
      ),
    ).toBe('match');
    expect(project(state.recordShotInSeries(), session)).toBe('match');
    const overrideOnly = Session.create(Discipline.rifle50m()).recordShot(
      null,
      new Score(100),
      new Date(),
      undefined,
      false,
      Mode.sighting(),
      { competitionContext: context },
    );
    expect(toCompetitionStateDto(state, overrideOnly.allShots).athleteTargetControl?.effective).toBe('MATCH');
    expect(project(state, overrideOnly)).toBe('match');
  });
});

// SPDX-License-Identifier: MIT
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { AR60 } from '@/main/modules/competition/domain/competitionTypes';
import type { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Session } from '@/main/modules/session/domain/Session';
import { laneVistaDefinition, projectLaneVista } from '@/main/modules/vista/application/LaneVistaProjection';

// Pure projection tests use a valid display definition without expanding the source's supported-event gate.
const definitionSession = Session.create(Discipline.airRifle10m());
const definition = laneVistaDefinition(
  CompetitionState.create('definition', definitionSession.id, AR60.config),
  definitionSession,
)!;
export function projectVistaTargetMode(
  competition: CompetitionState,
  session: Session,
  interruption: LaneInterruptionRecord | null,
) {
  return projectLaneVista({
    sourceId: 'lane-1',
    competition,
    session,
    definition,
    history: [{ session, stage: competition.currentStageIndex, shotContexts: new Map(), shootOffSeries: new Map() }],
    historyComplete: true,
    generation: 'generation',
    revision: 1,
    laneName: 'Lane 1',
    clock: null,
    interruption,
    shootOffSeries: null,
  }).participants[0]!.mode;
}

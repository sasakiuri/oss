// SPDX-License-Identifier: MIT

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type {
  IQualificationMalfunctionSignalContextSource,
  QualificationMalfunctionSignalContext,
} from '@/main/modules/qualification-malfunction-signal';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { ITimedTargetControl } from '@/main/modules/timed-target';

import type { LaneAssignmentSnapshot } from './LaneAssignmentPublisher';

export interface ILaneAssignmentSnapshotSource {
  getCurrentAssignment(competitionId?: string): LaneAssignmentSnapshot | null;
}

/** Reads the current competition, athlete assignment, session and exposure as one trusted snapshot. */
export class LaneQualificationMalfunctionContextSource implements IQualificationMalfunctionSignalContextSource {
  constructor(
    private readonly competitions: ICompetitionRepository,
    private readonly sessions: ISessionRepository,
    private readonly assignments: ILaneAssignmentSnapshotSource,
    private readonly timedTargets: Pick<ITimedTargetControl, 'getState'>,
  ) {}

  async capture(): Promise<QualificationMalfunctionSignalContext> {
    const competition = await this.competitions.findActive();
    if (!competition || competition.phase === 'FINISHED') {
      throw new Error('A qualification malfunction can only be declared during an active competition');
    }

    const assignment = this.assignments.getCurrentAssignment(competition.id);
    if (!assignment?.athlete) {
      throw new Error('An assigned athlete is required to declare a qualification malfunction');
    }

    const session = await this.sessions.findById(competition.sessionId);
    if (!session || session.isFinished) {
      throw new Error(`Active session ${competition.sessionId} is unavailable`);
    }

    const stage = competition.config.stages[competition.currentStageIndex];
    const series = stage?.series[competition.currentSeriesIndex];
    if (!stage || !series) throw new Error('The current competition stage and series are unavailable');

    const timedTargetState = this.timedTargets.getState(competition.id);
    const currentTimedTarget =
      timedTargetState?.stageIndex === competition.currentStageIndex &&
      timedTargetState.seriesIndex === competition.currentSeriesIndex
        ? timedTargetState
        : null;
    const configuredProgramId =
      session.mode.value === 'SIGHTING' ? stage.sightingTimedTargetProgramId : series.timedTargetProgramId;

    return {
      competitionId: competition.id,
      sessionId: competition.sessionId,
      participantId: assignment.athlete.id,
      participantName: assignment.athlete.name,
      startNumber: String(assignment.athlete.startNumber),
      phase: session.mode.value,
      stageIndex: competition.currentStageIndex,
      seriesIndex: competition.currentSeriesIndex,
      seriesShotLimit: series.maxShots > 0 ? series.maxShots : null,
      recordedShots: competition.seriesShotCount,
      timedTargetProgramId: currentTimedTarget?.programId ?? configuredProgramId ?? null,
      exposureIndex: currentTimedTarget?.exposureIndex ?? null,
    };
  }
}

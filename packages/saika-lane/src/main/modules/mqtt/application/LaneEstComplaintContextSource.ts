// SPDX-License-Identifier: MIT

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { EstComplaintSignalContext, IEstComplaintSignalContextSource } from '@/main/modules/est-complaint-signal';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { ITimedTargetControl } from '@/main/modules/timed-target';

import type { ILaneAssignmentSnapshotSource } from './LaneQualificationMalfunctionContextSource';
import { resolveCompetitionShotPlacement } from './ShotCompetitionPlacement';

/** Reads the current competition, athlete assignment, session and latest shot as one trusted snapshot. */
export class LaneEstComplaintContextSource implements IEstComplaintSignalContextSource {
  constructor(
    private readonly competitions: ICompetitionRepository,
    private readonly sessions: ISessionRepository,
    private readonly assignments: ILaneAssignmentSnapshotSource,
    private readonly timedTargets: Pick<ITimedTargetControl, 'getState'>,
  ) {}

  async capture(): Promise<EstComplaintSignalContext> {
    const competition = await this.competitions.findActive();
    if (!competition || competition.phase === 'FINISHED') {
      throw new Error('An EST complaint can only be declared during an active competition');
    }

    const assignment = this.assignments.getCurrentAssignment(competition.id);
    if (!assignment?.athlete) throw new Error('An assigned athlete is required to declare an EST complaint');

    const session = await this.sessions.findById(competition.sessionId);
    if (!session || session.isFinished) throw new Error(`Active session ${competition.sessionId} is unavailable`);

    const stage = competition.config.stages[competition.currentStageIndex];
    const series = stage?.series[competition.currentSeriesIndex];
    if (!stage || !series) throw new Error('The current competition stage and series are unavailable');

    const shotsInCurrentSeries = session.allShots
      .map((shot) => ({
        shot,
        placement: resolveCompetitionShotPlacement(shot, session.allShots, competition),
      }))
      .filter(
        ({ shot, placement }) =>
          shot.mode.value === session.mode.value &&
          placement.stageIndex === competition.currentStageIndex &&
          placement.seriesIndex === competition.currentSeriesIndex,
      )
      .sort((left, right) => left.placement.shotNumberInSeries - right.placement.shotNumberInSeries);
    const latest = shotsInCurrentSeries.at(-1) ?? null;
    const timedTargetState = this.timedTargets.getState(competition.id);
    const currentTimedTarget =
      timedTargetState?.stageIndex === competition.currentStageIndex &&
      timedTargetState.seriesIndex === competition.currentSeriesIndex
        ? timedTargetState
        : null;
    const configuredProgramId =
      session.mode.value === 'SIGHTING' ? stage.sightingTimedTargetProgramId : series.timedTargetProgramId;

    const recovery = competition.config.timedTarget?.recovery;
    const procedure =
      session.mode.value === 'MATCH' && recovery?.procedure === 'QUALIFICATION'
        ? recovery.missingShotComplaints?.find((item) => item.stageId === stage.id)
        : undefined;
    return {
      ...(competition.config.rulePackIdentity && competition.config.round
        ? {
            rules: {
              round: competition.config.round,
              identity: competition.config.rulePackIdentity,
              procedures: competition.config.estComplaints?.procedures ?? [],
            },
          }
        : {}),
      ...(procedure
        ? {
            missingShotProcedure: {
              notification: procedure.notification,
              seriesRepeatAllowed: procedure.seriesRepeatAllowed,
              ruleReference: procedure.ruleReference,
            },
          }
        : {}),
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
      lastShot: latest
        ? {
            shotId: latest.shot.id,
            shotNumberInSeries: latest.placement.shotNumberInSeries,
            firedAt: latest.shot.timestamp.toISOString(),
            receivedAt: latest.shot.receivedAt.toISOString(),
          }
        : null,
    };
  }
}

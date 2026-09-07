import { finalRecoveryStatus, type IFinalRecoveryRepository } from '@/main/modules/final-recoveries';
import type { IFinalFiringRepository } from '@/main/modules/final-recovery-firing';
import { scoreCorrectionDigest, type ScoreCorrectionBasis } from '@/main/modules/results';

import type { IScoreCorrectionCaseSource, ScoreCorrectionRequest } from '../domain/ScoreCorrection';

/** Adapts completed Final recovery evidence to score review without making the firing executor own scores. */
export class FinalFiringScoreCorrectionCaseSource implements IScoreCorrectionCaseSource {
  constructor(
    private readonly recoveries: IFinalRecoveryRepository,
    private readonly firings: IFinalFiringRepository,
  ) {}
  list(basis: ScoreCorrectionBasis) {
    return this.eligible(basis).map(({ value, ruling }) => ({
      id: value.id,
      summary: `Final recovery: ${value.summary}`,
      decisionId: ruling.id,
      decision: ruling.statement,
    }));
  }
  revision(caseId: string, decisionId: string, basis: ScoreCorrectionBasis) {
    const source = this.require(caseId, decisionId, basis);
    return scoreCorrectionDigest(source);
  }
  validate(request: ScoreCorrectionRequest, basis: ScoreCorrectionBasis) {
    const { run, value } = this.require(request.caseId, request.decisionId, basis);
    const firing = run.request;
    const series = firing.seriesIndex;
    if (basis.seriesShotCounts[series] !== 5)
      throw new Error('Reconcile the original five-shot Final result series first');
    const offset = basis.seriesShotCounts.slice(0, series).reduce((sum, count) => sum + count, 0);
    const missingEstShot = firing.finalIncident === 'EST_FAILURE' && value.procedureProfile === 'PISTOL_25M_WOMEN';
    if (missingEstShot && firing.shotsToFire !== 1)
      throw new Error('A P25 Final EST replacement must contain one shot');
    const start = offset + (firing.remedy === 'COMPLETE_REMAINING_SHOTS' ? firing.recordedShots : 0);
    const evidence = run.evidence!;
    if (request.changes.length !== evidence.shots.length)
      throw new Error('Review every authorized recovery shot together');
    const changes = [...request.changes].sort((a, b) => a.shotIndex - b.shotIndex);
    for (const [index, shot] of evidence.shots.entries()) {
      const change = changes[index]!;
      const validSlot = missingEstShot
        ? change.shotIndex >= offset && change.shotIndex < offset + 5
        : change.shotIndex === start + index;
      if (change.operation !== 'REPLACE' || !validSlot || change.sourceShotId !== shot.shotId)
        throw new Error('Replace the authorized original Final slots with recovery shot IDs in firing order');
      if (firing.remedy === 'COMPLETE_REMAINING_SHOTS' && basis.shots[change.shotIndex]?.scoreX10 !== 0)
        throw new Error('Final completion can only replace the original missing-shot zero slots');
    }
  }
  private require(caseId: string, decisionId: string, basis: ScoreCorrectionBasis) {
    const source = this.eligible(basis).find(({ value, ruling }) => value.id === caseId && ruling.id === decisionId);
    if (!source)
      throw new Error('Completed recovery evidence and the current Jury ruling must match this finalist and event');
    return source;
  }
  private eligible(basis: ScoreCorrectionBasis) {
    if (basis.resultScope !== 'FINAL') return [];
    return this.recoveries.findCasesByEvent(basis.eventId).flatMap((value) => {
      const entries = this.recoveries.findEntries([value.id]).get(value.id) ?? [];
      if (finalRecoveryStatus(entries) !== 'COMPLETED') return [];
      const ruling = entries.filter((entry) => entry.type === 'JURY_RULING').at(-1);
      const authorization = entries.filter((entry) => entry.type === 'REMEDY_AUTHORIZED').at(-1);
      const completion = entries.filter((entry) => entry.type === 'COMPLETED').at(-1);
      if (!ruling || !authorization || !completion) return [];
      const runs = this.firings
        .list(value.id)
        .filter(
          (run) =>
            !(
              value.incidentType === 'EST_FAILURE' &&
              value.procedureProfile === 'PISTOL_25M_WOMEN' &&
              (authorization.shotCount !== 1 || run.request.shotsToFire !== 1)
            ) &&
            run.request.participantId === basis.participantId &&
            run.request.competitionId === value.competitionId &&
            run.request.authorizationId === authorization.id &&
            value.affectedLaneIds.includes(run.intent.laneId) &&
            run.evidence?.status === 'COMPLETED' &&
            !run.evidence.captureIssues.length &&
            run.evidence.shots.length === run.request.shotsToFire &&
            run.evidence.shots.every((shot) => shot.eligible),
        );
      if (runs.length !== 1) return [];
      return [{ value, ruling, authorization, completion, run: runs[0]! }];
    });
  }
}

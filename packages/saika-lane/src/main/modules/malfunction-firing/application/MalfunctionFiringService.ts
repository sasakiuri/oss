import { canonicalJson } from '@sasakiuri/saika-rules';

import {
  buildTimedTargetSchedule,
  projectTimedTargetSchedule,
  type ITimedTargetControl,
} from '@/main/modules/timed-target';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

import {
  MALFUNCTION_FIRING_OWNER,
  FINAL_RECOVERY_FIRING_OWNER,
  recoveryFiringOwner,
  type IMalfunctionFiringContextSource,
  type IMalfunctionFiringControl,
  type IMalfunctionFiringRepository,
  type MalfunctionFiringRequest,
  type MalfunctionFiringRun,
} from '../domain/MalfunctionFiring';

/** Owns only isolated acquisition. Completed firing is not an applied score or an official decision. */
export class MalfunctionFiringService implements IMalfunctionFiringControl {
  private starting = false;

  constructor(
    private readonly repository: IMalfunctionFiringRepository,
    private readonly source: IMalfunctionFiringContextSource,
    private readonly timing: ITimedTargetControl,
    eventBus: IEventBus,
    private readonly now: () => Date = () => new Date(),
    private readonly acceptedObservationIds: (runId: string) => readonly string[] = () => [],
  ) {
    eventBus.on('ShotRecorded', (event) => this.capture(event));
    eventBus.on('TimedTargetSequenceChanged', ({ state }) => {
      if (
        !state.executionContext ||
        ![MALFUNCTION_FIRING_OWNER, FINAL_RECOVERY_FIRING_OWNER].includes(state.executionContext.owner)
      )
        return;
      const run = repository.find(state.executionContext.referenceId);
      if (!run || run.status !== 'RUNNING' || recoveryFiringOwner(run.request) !== state.executionContext.owner) return;
      if (state.phase === 'COMPLETE') repository.finish(run.request.runId, 'COMPLETED', 'Recording windows elapsed');
      if (state.phase === 'CANCELLED')
        repository.finish(run.request.runId, 'CANCELLED', state.terminalReason ?? 'Timing cancelled');
    });
  }

  async start(request: MalfunctionFiringRequest): Promise<MalfunctionFiringRun> {
    const existing = this.repository.find(request.runId);
    if (existing) {
      if (canonicalJson(existing.request) !== canonicalJson(request))
        throw new Error('Run ID is bound to another authorization');
      return this.read(request.competitionId, request.runId);
    }
    if (this.starting) throw new Error('A malfunction firing start is already being validated');
    this.starting = true;
    try {
      this.restore();
      if (this.repository.active()) throw new Error('A malfunction firing run is already active');
      const prepared = await this.source.prepare(request);
      if (prepared.plan.remedy !== request.remedy || prepared.plan.shotsToFire !== request.shotsToFire)
        throw new Error('Authorization does not match the Lane rule plan');
      const loadAt = Date.parse(request.loadAt),
        decidedAt = Date.parse(request.decidedAt);
      if (!request.officialName.trim() || !Number.isFinite(loadAt) || !Number.isFinite(decidedAt) || decidedAt > loadAt)
        throw new Error('Valid official and decision time are required before LOAD');
      if (loadAt < this.now().getTime()) throw new Error('A new firing run cannot start in the past');
      const activeTiming = this.timing.getState();
      if (activeTiming && !['COMPLETE', 'CANCELLED'].includes(activeTiming.phase))
        throw new Error('Finish or cancel the current timed-target sequence before malfunction firing');
      if (activeTiming && loadAt < activeTiming.nextLoadAllowedAt.getTime())
        throw new Error('Wait for the current timed-target pause before malfunction firing');
      this.repository.appendStart({
        request: structuredClone(request),
        ...prepared,
        startedAt: this.now().toISOString(),
      });
      try {
        this.timing.start({
          sequenceId: request.runId,
          competitionId: request.competitionId,
          program: prepared.plan.program,
          stageIndex: request.stageIndex,
          seriesIndex: request.seriesIndex,
          targetProfileId: prepared.targetProfileId,
          loadAt: new Date(request.loadAt),
          executionContext: {
            shotDisposition: 'ISOLATED',
            owner: recoveryFiringOwner(request),
            referenceId: request.runId,
          },
        });
      } catch (error) {
        this.repository.finish(
          request.runId,
          'CANCELLED',
          `Timing start failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
      return this.require(request.competitionId, request.runId);
    } finally {
      this.starting = false;
    }
  }

  read(competitionId: string, runId: string): MalfunctionFiringRun {
    const run = this.require(competitionId, runId);
    if (run.status === 'RUNNING') {
      const state = this.timing.getState(competitionId);
      if (state?.sequenceId !== runId) this.repository.finish(runId, 'CANCELLED', 'Timing sequence is unavailable');
      else if (state.phase === 'COMPLETE') this.repository.finish(runId, 'COMPLETED', 'Recording windows elapsed');
      else if (state.phase === 'CANCELLED')
        this.repository.finish(runId, 'CANCELLED', state.terminalReason ?? 'Timing cancelled');
    }
    const updated = this.require(competitionId, runId);
    const captured = new Set(updated.shots.map((shot) => shot.observationId));
    return {
      ...updated,
      captureIssues: this.acceptedObservationIds(runId)
        .filter((id) => !captured.has(id))
        .map((id) => `Accepted observation ${id} has no captured shot`),
    };
  }

  cancel(
    competitionId: string,
    runId: string,
    reason: string,
    request?: MalfunctionFiringRequest,
  ): MalfunctionFiringRun {
    if (!reason.trim()) throw new Error('Cancellation reason is required');
    if (request && (request.runId !== runId || request.competitionId !== competitionId))
      throw new Error('Cancellation request belongs to another run');
    const existing = this.repository.find(runId);
    if (request && existing && canonicalJson(existing.request) !== canonicalJson(request))
      throw new Error('Cancellation instructions differ from the stored run');
    if (!existing && request) {
      this.repository.appendCancelledRequest(structuredClone(request), reason);
      return this.require(competitionId, runId);
    }
    const run = this.read(competitionId, runId);
    if (run.status !== 'RUNNING') return run;
    this.timing.cancel({ sequenceId: runId, reason });
    this.repository.finish(runId, 'CANCELLED', reason);
    return this.require(competitionId, runId);
  }

  restore(): void {
    const run = this.repository.active();
    if (run) this.read(run.request.competitionId, run.request.runId);
  }

  private require(competitionId: string, runId: string): MalfunctionFiringRun {
    const run = this.repository.find(runId);
    if (!run || run.request.competitionId !== competitionId)
      throw new Error('Malfunction firing run does not belong to this competition');
    return run;
  }

  private capture(event: ShotRecordedEvent): void {
    if (
      !event.acquisitionContext ||
      ![MALFUNCTION_FIRING_OWNER, FINAL_RECOVERY_FIRING_OWNER].includes(event.acquisitionContext.owner)
    )
      return;
    const run = this.repository.find(event.acquisitionContext.referenceId);
    if (!run || recoveryFiringOwner(run.request) !== event.acquisitionContext.owner)
      throw new Error('No durable recovery run owns this shot');
    if (event.aggregateId !== run.request.sessionId) throw new Error('Malfunction shot belongs to another session');
    if (run.shots.some((shot) => shot.observationId && shot.observationId === event.shot.sourceObservationId)) return;
    if (!run.plan || !run.targetProfileId) throw new Error('No firing program was started for this observation');
    const schedule = buildTimedTargetSchedule({
      sequenceId: run.request.runId,
      competitionId: run.request.competitionId,
      program: run.plan.program,
      stageIndex: run.request.stageIndex,
      seriesIndex: run.request.seriesIndex,
      targetProfileId: run.targetProfileId,
      loadAt: new Date(run.request.loadAt),
    });
    const projection = projectTimedTargetSchedule(schedule, event.shot.timestamp);
    const eligibleInExposure = run.shots.filter(
      (shot) =>
        shot.eligible &&
        projectTimedTargetSchedule(schedule, new Date(shot.firedAt)).exposureIndex === projection.exposureIndex,
    ).length;
    const capacity = projection.exposureIndex === null ? 0 : schedule.exposures[projection.exposureIndex]!.maximumShots;
    const reviewReason =
      run.status === 'CANCELLED'
        ? 'Run was cancelled'
        : !projection.shotWindowOpen
          ? 'Outside authorized recording window'
          : eligibleInExposure >= capacity
            ? 'Exposure shot limit exceeded'
            : null;
    const shot = event.shot;
    this.repository.appendShot(run.request.runId, {
      shotId: shot.id,
      observationId: shot.sourceObservationId ?? null,
      scoreX10: shot.score.value,
      deviceScoreX10: shot.deviceScore?.value ?? null,
      calculatedScoreX10: shot.calculatedScore.value,
      innerTen: shot.innerTen,
      x: shot.impactPoint?.x ?? null,
      y: shot.impactPoint?.y ?? null,
      firedAt: shot.timestamp.toISOString(),
      receivedAt: shot.receivedAt.toISOString(),
      eligible: reviewReason === null,
      reviewReason,
    });
  }
}

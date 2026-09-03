// SPDX-License-Identifier: MIT
import { emitPhaseChanged } from '@/main/modules/competition/application/emitPhaseChanged';
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

import type { IQualificationRecoveryControl } from '../domain/IQualificationRecoveryControl';
import type {
  ApplyQualificationRecoverySettlementInput,
  IQualificationRecoverySettlementControl,
} from '../domain/IQualificationRecoverySettlementControl';
import type { IQualificationRecoverySettlementRepository } from '../domain/IQualificationRecoverySettlementRepository';
import {
  createQualificationRecoverySettlement,
  qualificationRecoverySettlementRequestMatches,
  type QualificationRecoverySettlementRecord,
  type QualificationRecoverySettlementRequest,
  type QualificationRecoverySettlementShotEvidence,
} from '../domain/QualificationRecoverySettlement';

/** Applies a no-fire retain-series decision without entering the firing or scoring boundaries. */
export class QualificationRecoverySettlementService implements IQualificationRecoverySettlementControl {
  constructor(
    private readonly repository: IQualificationRecoverySettlementRepository,
    private readonly sessionRepository: ISessionRepository,
    private readonly competitionRepository: ICompetitionRepository,
    private readonly interruptionControl: Pick<ICompetitionInterruptionControl, 'get' | 'clear'>,
    private readonly recoveryControl: Pick<IQualificationRecoveryControl, 'getLatest'>,
    private readonly eventBus: IEventBus,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async apply(input: ApplyQualificationRecoverySettlementInput): Promise<QualificationRecoverySettlementRecord> {
    const request = normalizeRequest(input, this.now);
    const existing = this.repository.findByDecisionId(request.decisionId);
    if (existing) {
      if (!qualificationRecoverySettlementRequestMatches(existing, request)) {
        throw new Error(`Qualification recovery decision ${request.decisionId} already has a different settlement`);
      }
      await this.reconcileCompetition(existing);
      return existing;
    }

    if (request.expectedRecordedShots !== request.expectedSeriesShotLimit) {
      throw new Error('KEEP_RECORDED_SERIES requires every series shot to be recorded');
    }
    if (request.appliedAt.getTime() < request.decidedAt.getTime()) {
      throw new Error('Qualification recovery cannot be settled before its official decision');
    }
    const activeRun = this.recoveryControl.getLatest(request.competitionId);
    if (activeRun?.status === 'RUNNING') {
      throw new Error(`Qualification recovery run ${activeRun.runId} is still running`);
    }

    const competition = await this.requireBoundCompetition(request);
    const interruption = this.interruptionControl.get(request.competitionId);
    if (!interruption) {
      throw new Error(`Qualification recovery decision ${request.decisionId} has no paused Lane interruption`);
    }
    if (interruption.interruptionId !== request.interruptionId || interruption.status !== 'PAUSED') {
      throw new Error(
        `Qualification recovery decision ${request.decisionId} does not match the paused Lane interruption`,
      );
    }

    const session = await this.sessionRepository.findById(competition.sessionId);
    if (!session) throw new Error(`Session not found: ${competition.sessionId}`);
    if (session.isFinished) throw new Error(`Session ${session.id} is already finished`);
    const placement = resolveSessionPlacement(competition);
    const matchShots = [...session.matchShots].sort(compareShots);
    const expectedVisibleShots = placement.priorShots + request.expectedRecordedShots;
    if (matchShots.length !== expectedVisibleShots) {
      throw new Error(
        `Session has ${matchShots.length} MATCH shot(s), but ${expectedVisibleShots} are required at the interrupted position`,
      );
    }
    const recordedShots = matchShots.slice(placement.priorShots);

    const settlement = this.repository.append(
      createQualificationRecoverySettlement({
        id: crypto.randomUUID(),
        sessionId: session.id,
        sessionSeriesNumber: placement.seriesNumber,
        ...request,
        recordedShots: recordedShots.map(toShotEvidence),
      }),
    );
    await this.reconcileCompetition(settlement);
    return settlement;
  }

  get(decisionId: string): QualificationRecoverySettlementRecord | null {
    return this.repository.findByDecisionId(decisionId);
  }

  private async requireBoundCompetition(request: QualificationRecoverySettlementRequest): Promise<CompetitionState> {
    const competition = await this.competitionRepository.findById(request.competitionId);
    if (!competition) throw new Error(`Competition not found: ${request.competitionId}`);
    if (competition.sessionId.length === 0) throw new Error('Qualification recovery competition has no session');
    if (
      competition.currentStageIndex !== request.stageIndex ||
      competition.currentSeriesIndex !== request.seriesIndex
    ) {
      throw new Error(`Competition ${request.competitionId} has moved away from the interrupted series`);
    }
    if (competition.currentSeriesConfig.timedTargetProgramId !== request.expectedMatchProgramId) {
      throw new Error(`Competition ${request.competitionId} no longer uses ${request.expectedMatchProgramId}`);
    }
    if (competition.currentSeriesConfig.maxShots !== request.expectedSeriesShotLimit) {
      throw new Error('The current series shot limit no longer matches the retain-series decision');
    }
    if (competition.seriesShotCount !== request.expectedRecordedShots) {
      throw new Error(
        `Competition has ${competition.seriesShotCount} recorded shot(s), but the settlement expects ${request.expectedRecordedShots}`,
      );
    }
    if (competition.phase !== 'ACTIVE' && competition.phase !== 'SERIES_COMPLETE') {
      throw new Error(`Competition ${request.competitionId} cannot be settled from phase ${competition.phase}`);
    }
    return competition;
  }

  private async reconcileCompetition(settlement: QualificationRecoverySettlementRecord): Promise<void> {
    const state = await this.competitionRepository.findById(settlement.competitionId);
    if (!state) throw new Error(`Competition not found: ${settlement.competitionId}`);
    const comparison = comparePosition(state, settlement.stageIndex, settlement.seriesIndex);
    if (state.phase !== 'FINISHED' && comparison < 0) {
      throw new Error(`Competition ${state.id} is behind the settled recovery position`);
    }
    if (state.phase !== 'FINISHED' && comparison === 0) {
      const updated = state.keepRecordedQualificationSeries({
        programId: settlement.expectedMatchProgramId,
        expectedRecordedShots: settlement.expectedRecordedShots,
      });
      if (updated !== state) {
        await this.competitionRepository.save(updated);
        if (updated.phase !== state.phase) emitPhaseChanged(this.eventBus, updated, state.phase);
        this.eventBus.emit({
          type: 'SeriesCompleted',
          timestamp: Date.now(),
          aggregateId: updated.id,
          stageIndex: updated.currentStageIndex,
          seriesIndex: updated.currentSeriesIndex,
          shotCount: updated.seriesShotCount,
        });
      }
    }
    const interruption = this.interruptionControl.get(settlement.competitionId);
    if (interruption?.interruptionId === settlement.interruptionId) {
      this.interruptionControl.clear(settlement.competitionId);
    }
  }
}

function normalizeRequest(
  input: ApplyQualificationRecoverySettlementInput,
  now: () => Date,
): QualificationRecoverySettlementRequest {
  return {
    decisionId: requiredText(input.decisionId, 'decisionId'),
    competitionId: requiredText(input.competitionId, 'competitionId'),
    interruptionId: requiredText(input.interruptionId, 'interruptionId'),
    treatment: input.treatment,
    stageIndex: input.stageIndex,
    seriesIndex: input.seriesIndex,
    expectedMatchProgramId: requiredText(input.expectedMatchProgramId, 'expectedMatchProgramId'),
    expectedSeriesShotLimit: input.expectedSeriesShotLimit,
    expectedRecordedShots: input.expectedRecordedShots,
    decisionOfficialName: requiredText(input.decisionOfficialName, 'decisionOfficialName'),
    decisionRuleReference: requiredText(input.decisionRuleReference, 'decisionRuleReference'),
    decidedAt: validDate(input.decidedAt, 'decidedAt'),
    appliedBy: requiredText(input.appliedBy, 'appliedBy'),
    statement: requiredText(input.statement, 'statement'),
    appliedAt: validDate(input.appliedAt ?? now(), 'appliedAt'),
  };
}

function toShotEvidence(shot: Shot): QualificationRecoverySettlementShotEvidence {
  return {
    shotId: shot.id,
    shotNumber: shot.shotNumber,
    seriesNumber: shot.seriesNumber,
    scoreX10: shot.score.value,
    calculatedScoreX10: shot.calculatedScore.value,
    deviceScoreX10: shot.deviceScore?.value ?? null,
    innerTen: shot.innerTen,
    x: shot.impactPoint?.x ?? null,
    y: shot.impactPoint?.y ?? null,
    firedAt: shot.timestamp.toISOString(),
    receivedAt: shot.receivedAt.toISOString(),
    observationId: shot.sourceObservationId ?? null,
    targetProfileId: shot.targetProfileId ?? null,
    scoringGaugeProfileId: shot.scoringGaugeProfileId ?? null,
  };
}

function resolveSessionPlacement(competition: CompetitionState): { priorShots: number; seriesNumber: number } {
  let sessionBoundaryStage = 0;
  for (let stageIndex = 0; stageIndex <= competition.currentStageIndex; stageIndex += 1) {
    if (competition.config.stages[stageIndex]?.requiresNewSession) sessionBoundaryStage = stageIndex;
  }
  let priorShots = 0;
  let priorSeries = 0;
  for (let stageIndex = sessionBoundaryStage; stageIndex <= competition.currentStageIndex; stageIndex += 1) {
    const stage = competition.config.stages[stageIndex]!;
    if (!stage.scored) continue;
    const end = stageIndex === competition.currentStageIndex ? competition.currentSeriesIndex : stage.series.length;
    for (let seriesIndex = 0; seriesIndex < end; seriesIndex += 1) {
      const series = stage.series[seriesIndex]!;
      if (series.maxShots === 0 || series.purpose === 'POSITION_CHANGE_AND_SIGHTING') continue;
      priorShots += series.maxShots;
      priorSeries += 1;
    }
  }
  return { priorShots, seriesNumber: priorSeries + 1 };
}

function compareShots(left: Shot, right: Shot): number {
  return left.shotNumber - right.shotNumber || left.timestamp.getTime() - right.timestamp.getTime();
}

function comparePosition(state: CompetitionState, stageIndex: number, seriesIndex: number): number {
  if (state.currentStageIndex !== stageIndex) return state.currentStageIndex - stageIndex;
  return state.currentSeriesIndex - seriesIndex;
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be a valid date`);
  return new Date(value.getTime());
}

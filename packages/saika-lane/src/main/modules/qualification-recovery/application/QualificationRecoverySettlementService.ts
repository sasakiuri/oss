// SPDX-License-Identifier: MIT
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { requiredText, validDate } from '@/shared/validation';

import type { IQualificationRecoveryControl } from '../domain/IQualificationRecoveryControl';
import type {
  ApplyQualificationRecoverySettlementInput,
  IQualificationRecoverySettlementControl,
} from '../domain/IQualificationRecoverySettlementControl';
import type { IQualificationRecoverySettlementRepository } from '../domain/IQualificationRecoverySettlementRepository';
import type { InterruptedSeriesWording } from '../domain/QualificationRecoveryPlacement';
import {
  createQualificationRecoverySettlement,
  qualificationRecoverySettlementRequestMatches,
  type QualificationRecoverySettlementRecord,
  type QualificationRecoverySettlementRequest,
  type QualificationRecoverySettlementShotEvidence,
} from '../domain/QualificationRecoverySettlement';

import { findBoundCompetition, readInterruptedSeriesShots, reconcileRecoveredSeries } from './InterruptedSeries';

const SETTLEMENT_WORDING: InterruptedSeriesWording = {
  decision: 'retain-series decision',
  expectedBy: 'settlement',
  action: 'settled',
};

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

    const competition = await findBoundCompetition(this.competitionRepository, request, SETTLEMENT_WORDING);
    const interruption = this.interruptionControl.get(request.competitionId);
    if (!interruption) {
      throw new Error(`Qualification recovery decision ${request.decisionId} has no paused Lane interruption`);
    }
    if (interruption.interruptionId !== request.interruptionId || interruption.status !== 'PAUSED') {
      throw new Error(
        `Qualification recovery decision ${request.decisionId} does not match the paused Lane interruption`,
      );
    }

    const { session, placement, recordedShots } = await readInterruptedSeriesShots(
      this.sessionRepository,
      competition,
      request.expectedRecordedShots,
    );

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

  private reconcileCompetition(settlement: QualificationRecoverySettlementRecord): Promise<void> {
    const { competitionRepository, interruptionControl, eventBus } = this;
    return reconcileRecoveredSeries(
      { competitionRepository, interruptionControl, eventBus },
      settlement,
      SETTLEMENT_WORDING,
      (state) =>
        state.keepRecordedQualificationSeries({
          programId: settlement.expectedMatchProgramId,
          expectedRecordedShots: settlement.expectedRecordedShots,
        }),
    );
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

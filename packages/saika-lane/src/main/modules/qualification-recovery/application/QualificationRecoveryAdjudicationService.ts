// SPDX-License-Identifier: MIT
import type { QualificationRecoveryShotPayload } from '@sasakiuri/saika-protocol/QualificationRecovery';

import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import {
  isScoringGaugeProfileId,
  isTargetScoringProfileId,
  type ScoringGaugeProfileId,
  type TargetScoringProfileId,
} from '@/shared/target';
import { requiredText, validDate } from '@/shared/validation';

import type {
  ApplyQualificationRecoveryAdjudicationInput,
  IQualificationRecoveryAdjudicationControl,
} from '../domain/IQualificationRecoveryAdjudicationControl';
import type { IQualificationRecoveryAdjudicationRepository } from '../domain/IQualificationRecoveryAdjudicationRepository';
import type { IQualificationRecoveryControl } from '../domain/IQualificationRecoveryControl';
import type { IQualificationRecoveryShotEvidenceReader } from '../domain/IQualificationRecoveryShotEvidenceReader';
import {
  createQualificationRecoveryAdjudication,
  qualificationRecoveryAdjudicationRequestMatches,
  type QualificationRecoveryAdjudicationRecord,
  type QualificationRecoveryAdjudicationShot,
} from '../domain/QualificationRecoveryAdjudication';
import type { InterruptedSeriesWording } from '../domain/QualificationRecoveryPlacement';
import type { QualificationRecoveryRunRecord } from '../domain/QualificationRecoveryRun';

import { findBoundCompetition, readInterruptedSeriesShots, reconcileRecoveredSeries } from './InterruptedSeries';

const ADJUDICATION_WORDING: InterruptedSeriesWording = {
  decision: 'recovery authorization',
  expectedBy: 'recovery',
  action: 'adjudicated',
};

/** Applies completed firing evidence to score only after a distinct official command. */
export class QualificationRecoveryAdjudicationService implements IQualificationRecoveryAdjudicationControl {
  constructor(
    private readonly recoveryControl: Pick<IQualificationRecoveryControl, 'get'>,
    private readonly evidenceReader: IQualificationRecoveryShotEvidenceReader,
    private readonly adjudicationRepository: IQualificationRecoveryAdjudicationRepository,
    private readonly sessionRepository: ISessionRepository,
    private readonly competitionRepository: ICompetitionRepository,
    private readonly interruptionControl: Pick<ICompetitionInterruptionControl, 'get' | 'clear'>,
    private readonly eventBus: IEventBus,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async apply(input: ApplyQualificationRecoveryAdjudicationInput): Promise<QualificationRecoveryAdjudicationRecord> {
    const request = {
      runId: requiredText(input.runId, 'runId'),
      competitionId: requiredText(input.competitionId, 'competitionId'),
      appliedBy: requiredText(input.appliedBy, 'appliedBy'),
      statement: requiredText(input.statement, 'statement'),
      appliedAt: input.appliedAt ? validDate(input.appliedAt, 'appliedAt') : this.now(),
    };
    const existing = this.adjudicationRepository.findByRunId(request.runId);
    if (existing) {
      if (existing.competitionId !== request.competitionId) {
        throw new Error(`Qualification recovery run ${request.runId} does not belong to ${request.competitionId}`);
      }
      if (!qualificationRecoveryAdjudicationRequestMatches(existing, request)) {
        throw new Error(`Qualification recovery run ${request.runId} already has a different adjudication`);
      }
      await this.reconcileCompetition(existing);
      return existing;
    }

    const run = this.requireCompletedSeriesRecovery(request.runId);
    if (run.competitionId !== request.competitionId) {
      throw new Error(`Qualification recovery run ${request.runId} does not belong to ${request.competitionId}`);
    }
    if (request.appliedAt.getTime() < (run.terminalAt?.getTime() ?? Number.POSITIVE_INFINITY)) {
      throw new Error('Qualification recovery cannot be adjudicated before its firing window is complete');
    }
    const interruption = this.interruptionControl.get(run.competitionId);
    if (!interruption || interruption.interruptionId !== run.interruptionId || interruption.status !== 'PAUSED') {
      throw new Error(`Qualification recovery run ${run.runId} no longer matches the paused Lane interruption`);
    }
    const competition = await findBoundCompetition(this.competitionRepository, run, ADJUDICATION_WORDING);
    const {
      session,
      placement,
      recordedShots: originalShots,
    } = await readInterruptedSeriesShots(this.sessionRepository, competition, run.expectedRecordedShots);
    if (originalShots.length !== run.expectedRecordedShots) {
      throw new Error('The interrupted series no longer matches its immutable recorded-shot count');
    }

    const evidence = this.requireBoundEvidence(run);
    const treatment = run.authorization.seriesRecovery.treatment;
    if (treatment === 'KEEP_RECORDED_SERIES') {
      throw new Error('KEEP_RECORDED_SERIES does not authorize recovery firing or score replacement');
    }
    const authorizedShots = run.authorization.seriesRecovery.shotsToFire;
    competition.applyQualificationRecovery({
      programId: run.expectedMatchProgramId,
      treatment,
      expectedRecordedShots: run.expectedRecordedShots,
      authorizedShots,
    });
    const firstCreditedShotNumber =
      treatment === 'ANNUL_AND_REPEAT' && originalShots.length > 0
        ? Math.min(...originalShots.map((shot) => shot.shotNumber))
        : Math.max(0, ...session.allShots.map((shot) => shot.shotNumber)) + 1;
    const credited = evidence.map((payload, index) =>
      recoveryEvidenceToShot(payload, firstCreditedShotNumber + index, placement.seriesNumber, run),
    );
    const missTimestamp = run.terminalAt ?? request.appliedAt;
    while (credited.length < authorizedShots) {
      credited.push(
        Shot.create({
          impactPoint: null,
          score: Score.miss(),
          mode: Mode.match(),
          timestamp: missTimestamp,
          shotNumber: firstCreditedShotNumber + credited.length,
          seriesNumber: placement.seriesNumber,
          competitionContext: {
            competitionId: run.competitionId,
            stageIndex: run.stageIndex,
            seriesIndex: run.seriesIndex,
          },
          innerTen: false,
          calculatedScore: Score.miss(),
          receivedAt: request.appliedAt,
          targetProfileId: parseTargetProfileId(run.targetProfileId),
          ...(resolveScoringGaugeProfileId(competition) !== undefined
            ? { scoringGaugeProfileId: resolveScoringGaugeProfileId(competition) }
            : {}),
        }),
      );
    }

    const originalDisposition = treatment === 'ANNUL_AND_REPEAT' ? 'ANNULLED_ORIGINAL' : 'PRESERVED_ORIGINAL';
    const shots: QualificationRecoveryAdjudicationShot[] = [
      ...originalShots.map((shot) => ({ disposition: originalDisposition, shot }) as const),
      ...credited.map((shot, index) => ({
        disposition: index < evidence.length ? ('CREDITED_RECOVERY' as const) : ('CREDITED_MISS' as const),
        shot,
      })),
    ];
    const adjudication = this.adjudicationRepository.append(
      createQualificationRecoveryAdjudication({
        id: crypto.randomUUID(),
        runId: run.runId,
        competitionId: run.competitionId,
        sessionId: session.id,
        decisionId: run.decisionId,
        interruptionId: run.interruptionId,
        treatment,
        stageIndex: run.stageIndex,
        seriesIndex: run.seriesIndex,
        sessionSeriesNumber: placement.seriesNumber,
        expectedRecordedShots: run.expectedRecordedShots,
        authorizedShots,
        decisionOfficialName: run.officialName,
        decisionRuleReference: run.decisionRuleReference,
        decidedAt: run.decidedAt,
        appliedBy: request.appliedBy,
        statement: request.statement,
        appliedAt: request.appliedAt,
        shots,
      }),
    );
    await this.reconcileCompetition(adjudication);
    return adjudication;
  }

  get(runId: string): QualificationRecoveryAdjudicationRecord | null {
    return this.adjudicationRepository.findByRunId(runId);
  }

  private requireCompletedSeriesRecovery(runId: string): QualificationRecoveryRunRecord & {
    authorization: Extract<QualificationRecoveryRunRecord['authorization'], { phase: 'SERIES_RECOVERY' }>;
  } {
    const run = this.recoveryControl.get(runId);
    if (!run) throw new Error(`Qualification recovery run ${runId} not found`);
    if (run.status !== 'COMPLETED') throw new Error(`Qualification recovery run ${runId} is not completed`);
    if (run.authorization.phase !== 'SERIES_RECOVERY') {
      throw new Error('Extra sighting shots can never be credited to the MATCH score');
    }
    if (run.authorization.seriesRecovery.treatment === 'KEEP_RECORDED_SERIES') {
      throw new Error('KEEP_RECORDED_SERIES does not authorize recovery firing or score replacement');
    }
    if (!run.terminalAt) throw new Error(`Qualification recovery run ${runId} has no terminal time`);
    return run as QualificationRecoveryRunRecord & {
      authorization: Extract<QualificationRecoveryRunRecord['authorization'], { phase: 'SERIES_RECOVERY' }>;
    };
  }

  private requireBoundEvidence(run: QualificationRecoveryRunRecord): QualificationRecoveryShotPayload[] {
    const evidence = this.evidenceReader.findByRunId(run.runId).sort((left, right) => {
      const time = Date.parse(left.firedAt) - Date.parse(right.firedAt);
      return time === 0 ? left.shotId.localeCompare(right.shotId) : time;
    });
    const recordedById = new Map(run.shots.map((shot) => [shot.shotId, shot]));
    if (recordedById.size !== run.shots.length || evidence.length !== run.shots.length) {
      throw new Error('Recovery firing journal and full shot evidence have different shot counts');
    }
    if (evidence.length > authorizedShotCount(run)) {
      throw new Error('Recovery firing evidence exceeds the authorized shot count');
    }
    for (const payload of evidence) {
      const recorded = recordedById.get(payload.shotId);
      if (!recorded) throw new Error(`Recovery shot ${payload.shotId} is absent from the firing journal`);
      const mismatches = [
        payload.runId === run.runId ? null : 'runId',
        payload.decisionId === run.decisionId ? null : 'decisionId',
        payload.interruptionId === run.interruptionId ? null : 'interruptionId',
        payload.competitionId === run.competitionId ? null : 'competitionId',
        payload.phase === 'SERIES_RECOVERY' ? null : 'phase',
        payload.stageIndex === run.stageIndex ? null : 'stageIndex',
        payload.seriesIndex === run.seriesIndex ? null : 'seriesIndex',
        Date.parse(payload.firedAt) === recorded.firedAt.getTime() ? null : 'firedAt',
        (payload.observationId ?? null) === recorded.observationId ? null : 'observationId',
        payload.targetProfileId === undefined || payload.targetProfileId === run.targetProfileId
          ? null
          : 'targetProfileId',
        (payload.x === null) === (payload.y === null) ? null : 'coordinates',
      ].filter((value): value is string => value !== null);
      if (mismatches.length > 0) {
        throw new Error(`Recovery shot ${payload.shotId} does not match its run: ${mismatches.join(', ')}`);
      }
    }
    return evidence;
  }

  private reconcileCompetition(adjudication: QualificationRecoveryAdjudicationRecord): Promise<void> {
    const { competitionRepository, interruptionControl, eventBus } = this;
    return reconcileRecoveredSeries(
      { competitionRepository, interruptionControl, eventBus },
      adjudication,
      ADJUDICATION_WORDING,
      (state) =>
        state.applyQualificationRecovery({
          programId: state.currentSeriesConfig.timedTargetProgramId ?? '',
          treatment: adjudication.treatment,
          expectedRecordedShots: adjudication.expectedRecordedShots,
          authorizedShots: adjudication.authorizedShots,
        }),
    );
  }
}

function recoveryEvidenceToShot(
  payload: QualificationRecoveryShotPayload,
  shotNumber: number,
  seriesNumber: number,
  run: QualificationRecoveryRunRecord,
): Shot {
  const targetProfileId = parseTargetProfileId(payload.targetProfileId ?? run.targetProfileId);
  const scoringGaugeProfileId = parseScoringGaugeProfileId(payload.scoringGaugeProfileId);
  return Shot.reconstruct({
    id: payload.shotId,
    impactPoint: payload.x !== null && payload.y !== null ? new ImpactPoint(payload.x, payload.y) : null,
    score: new Score(payload.effectiveScoreX10),
    mode: Mode.match(),
    timestamp: new Date(payload.firedAt),
    shotNumber,
    seriesNumber,
    competitionContext: { competitionId: run.competitionId, stageIndex: run.stageIndex, seriesIndex: run.seriesIndex },
    innerTen: payload.innerTen,
    ...(payload.deviceScoreX10 !== null ? { deviceScore: new Score(payload.deviceScoreX10) } : {}),
    calculatedScore: new Score(payload.calculatedScoreX10),
    receivedAt: new Date(payload.receivedAt),
    ...(payload.observationId ? { sourceObservationId: payload.observationId } : {}),
    targetProfileId,
    ...(scoringGaugeProfileId ? { scoringGaugeProfileId } : {}),
  });
}

function resolveScoringGaugeProfileId(competition: CompetitionState): ScoringGaugeProfileId | undefined {
  return parseScoringGaugeProfileId(competition.effectiveScoringGaugeProfileId);
}

function parseTargetProfileId(value: string): TargetScoringProfileId {
  if (!isTargetScoringProfileId(value)) throw new Error(`Unknown target scoring profile: ${value}`);
  return value;
}

function parseScoringGaugeProfileId(value: string | undefined): ScoringGaugeProfileId | undefined {
  if (value === undefined) return undefined;
  if (!isScoringGaugeProfileId(value)) throw new Error(`Unknown scoring gauge profile: ${value}`);
  return value;
}

function authorizedShotCount(run: QualificationRecoveryRunRecord): number {
  return run.authorization.phase === 'EXTRA_SIGHTING'
    ? run.authorization.shotsToFire
    : run.authorization.seriesRecovery.shotsToFire;
}

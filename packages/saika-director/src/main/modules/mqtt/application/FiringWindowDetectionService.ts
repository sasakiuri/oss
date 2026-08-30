import type { FiringWindowDetectionPolicy } from '@/shared/competitionTypes';
import type { CompetitionShotObservation, ICompetitionShotJournal } from '../domain/ICompetitionShotJournal';
import type {
  FiringBoundarySignal,
  FiringCommandBoundary,
  FiringWindowViolation,
  IFiringWindowJournal,
} from '../domain/IFiringWindowJournal';
import { detectFiringWindowViolations } from './FiringWindowDetector';

export interface FiringWindowDetectionServiceOptions {
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly onViolationDetected?: (violation: FiringWindowViolation) => void;
}

/** Coordinates evidence journals and the pure detector without touching scores. */
export class FiringWindowDetectionService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly shotJournal: ICompetitionShotJournal,
    private readonly firingWindowJournal: IFiringWindowJournal,
    private readonly options: FiringWindowDetectionServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  recordBoundary(signal: FiringBoundarySignal, policy?: FiringWindowDetectionPolicy): void {
    const boundary: FiringCommandBoundary = {
      ...signal,
      id: this.createId(),
      recordedAt: this.now(),
    };
    this.firingWindowJournal.appendBoundary(boundary);
    if (policy) this.reconcileCompetition(signal.competitionId, policy);
  }

  observe(observation: CompetitionShotObservation, policy?: FiringWindowDetectionPolicy): void {
    if (!policy) return;
    this.evaluateObservation(
      observation,
      this.firingWindowJournal.findBoundariesByCompetition(observation.competitionId),
      policy,
    );
  }

  reconcileCompetition(competitionId: string, policy?: FiringWindowDetectionPolicy): void {
    if (!policy) return;
    const boundaries = this.firingWindowJournal.findBoundariesByCompetition(competitionId);
    for (const observation of this.shotJournal.findByCompetition(competitionId)) {
      this.evaluateObservation(observation, boundaries, policy);
    }
  }

  private evaluateObservation(
    observation: CompetitionShotObservation,
    boundaries: readonly FiringCommandBoundary[],
    policy: FiringWindowDetectionPolicy,
  ): void {
    for (const match of detectFiringWindowViolations(observation, boundaries, policy)) {
      const violation: FiringWindowViolation = {
        id: this.createId(),
        competitionId: observation.competitionId,
        laneId: observation.laneId,
        sessionId: observation.sessionId,
        shotId: observation.shotId,
        observationId: observation.id,
        shotMode: observation.mode,
        policyRuleId: match.rule.id,
        kind: match.kind,
        ruleReference: match.rule.ruleReference,
        reviewGuidance: match.rule.reviewGuidance,
        timestampSource: policy.timestampSource,
        clockToleranceMilliseconds: policy.clockToleranceMilliseconds,
        evaluatedShotAt: match.evaluatedShotAt,
        firedAt: observation.firedAt,
        receivedAt: observation.receivedAt,
        observedAt: observation.observedAt,
        decisiveBoundaryId: match.decisiveBoundaryId,
        detectedAt: this.now(),
      };
      if (this.firingWindowJournal.appendViolation(violation)) {
        this.options.onViolationDetected?.(violation);
      }
    }
  }
}

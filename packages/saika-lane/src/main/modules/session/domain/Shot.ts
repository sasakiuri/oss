// SPDX-License-Identifier: MIT

import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import type { ScoringGaugeProfileId, TargetScoringProfileId } from '@/shared/target';

import { parseShotCompetitionContext, type ShotCompetitionContext } from './ShotCompetitionContext';

/** Immutable shot, identified by ID. */
export class Shot {
  /** UUID. */
  readonly id: string;

  /**
   * Impact point (null for a miss shot)
   */
  readonly impactPoint: ImpactPoint | null;

  readonly score: Score;

  readonly mode: Mode;

  /**
   * Firing time
   */
  readonly timestamp: Date;

  /**
   * Shot number (1–N)
   */
  readonly shotNumber: number;

  /**
   * Series number (0=sighting, 1+=match series)
   */
  readonly seriesNumber: number;

  /**
   * Whether it is in the X ring (inner ten)
   * Based on physical X ring geometry determination (impactDistance <= xRingRadius)
   */
  readonly innerTen: boolean;

  /**
   * Score calculated by the target device (optional)
   */
  readonly deviceScore?: Score;

  /** Score independently calculated from coordinates by Saika Lane. */
  readonly calculatedScore: Score;

  /** Time at which Saika Lane received the observation. */
  readonly receivedAt: Date;

  /** Link to the immutable pre-rule observation journal, when available. */
  readonly sourceObservationId?: string;
  readonly competitionContext?: ShotCompetitionContext;

  /** Target face used for Lane's independent coordinate score. */
  readonly targetProfileId?: TargetScoringProfileId;

  /** Rule-selected scoring gauge used for Lane's independent coordinate score. */
  readonly scoringGaugeProfileId?: ScoringGaugeProfileId;

  private constructor(
    id: string,
    impactPoint: ImpactPoint | null,
    score: Score,
    mode: Mode,
    timestamp: Date,
    shotNumber: number,
    seriesNumber: number,
    innerTen: boolean,
    deviceScore?: Score,
    calculatedScore?: Score,
    receivedAt?: Date,
    sourceObservationId?: string,
    targetProfileId?: TargetScoringProfileId,
    scoringGaugeProfileId?: ScoringGaugeProfileId,
    competitionContext?: ShotCompetitionContext,
  ) {
    this.id = id;
    this.impactPoint = impactPoint;
    this.score = score;
    this.mode = mode;
    this.timestamp = timestamp;
    this.shotNumber = shotNumber;
    this.seriesNumber = seriesNumber;
    this.innerTen = innerTen;
    this.deviceScore = deviceScore;
    this.calculatedScore = calculatedScore ?? score;
    this.receivedAt = receivedAt ?? timestamp;
    this.sourceObservationId = sourceObservationId;
    this.targetProfileId = targetProfileId;
    this.scoringGaugeProfileId = scoringGaugeProfileId;
    this.competitionContext =
      competitionContext === undefined ? undefined : parseShotCompetitionContext(competitionContext);

    Object.freeze(this);
  }

  static create(props: {
    impactPoint: ImpactPoint | null;
    score: Score;
    mode: Mode;
    timestamp: Date;
    shotNumber: number;
    seriesNumber: number;
    innerTen: boolean;
    deviceScore?: Score;
    calculatedScore?: Score;
    receivedAt?: Date;
    sourceObservationId?: string;
    targetProfileId?: TargetScoringProfileId;
    scoringGaugeProfileId?: ScoringGaugeProfileId;
    competitionContext?: ShotCompetitionContext;
  }): Shot {
    // Invariant: shotNumber must be an integer >= 1
    if (props.shotNumber < 1) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'shotNumber must be an integer >= 1' });
    }
    if (!Number.isInteger(props.shotNumber)) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'shotNumber must be an integer' });
    }

    // Invariant: seriesNumber must be an integer >= 0
    if (props.seriesNumber < 0) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'seriesNumber must be an integer >= 0' });
    }
    if (!Number.isInteger(props.seriesNumber)) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'seriesNumber must be an integer' });
    }

    // Invariant: timestamp must be a valid date/time
    if (isNaN(props.timestamp.getTime())) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'timestamp must be a valid date/time' });
    }
    if (props.receivedAt !== undefined && isNaN(props.receivedAt.getTime())) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'receivedAt must be a valid date/time' });
    }

    // Auto-generate ID (UUID v4)
    const id = crypto.randomUUID();

    return new Shot(
      id,
      props.impactPoint,
      props.score,
      props.mode,
      props.timestamp,
      props.shotNumber,
      props.seriesNumber,
      props.innerTen,
      props.deviceScore,
      props.calculatedScore,
      props.receivedAt,
      props.sourceObservationId,
      props.targetProfileId,
      props.scoringGaugeProfileId,
      props.competitionContext,
    );
  }

  /** Restores a shot with its existing ID. */
  static reconstruct(data: {
    id: string;
    impactPoint: ImpactPoint | null;
    score: Score;
    mode: Mode;
    timestamp: Date;
    shotNumber: number;
    seriesNumber: number;
    innerTen: boolean;
    deviceScore?: Score;
    calculatedScore?: Score;
    receivedAt?: Date;
    sourceObservationId?: string;
    targetProfileId?: TargetScoringProfileId;
    scoringGaugeProfileId?: ScoringGaugeProfileId;
    competitionContext?: ShotCompetitionContext;
  }): Shot {
    // Invariant: shotNumber must be an integer >= 1
    if (data.shotNumber < 1) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'shotNumber must be an integer >= 1' });
    }
    if (!Number.isInteger(data.shotNumber)) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'shotNumber must be an integer' });
    }

    // Invariant: seriesNumber must be an integer >= 0
    if (data.seriesNumber < 0) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'seriesNumber must be an integer >= 0' });
    }
    if (!Number.isInteger(data.seriesNumber)) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'seriesNumber must be an integer' });
    }

    // Invariant: timestamp must be a valid date/time
    if (isNaN(data.timestamp.getTime())) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'timestamp must be a valid date/time' });
    }
    if (data.receivedAt !== undefined && isNaN(data.receivedAt.getTime())) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'receivedAt must be a valid date/time' });
    }

    // Reconstruct using the existing ID
    return new Shot(
      data.id,
      data.impactPoint,
      data.score,
      data.mode,
      data.timestamp,
      data.shotNumber,
      data.seriesNumber,
      data.innerTen,
      data.deviceScore,
      data.calculatedScore,
      data.receivedAt,
      data.sourceObservationId,
      data.targetProfileId,
      data.scoringGaugeProfileId,
      data.competitionContext,
    );
  }

  /** Compares shot IDs. */
  equals(other: Shot): boolean {
    return this.id === other.id;
  }

  /**
   * @deprecated Use the innerTen property directly
   */
  isInner(): boolean {
    return this.innerTen;
  }
}

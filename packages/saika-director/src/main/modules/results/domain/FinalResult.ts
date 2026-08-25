import { FinalResultId } from './FinalResultId';
import { EventId, ParticipantId } from '@/main/modules/championship';

export type FinalResultStatus = 'in_progress' | 'eliminated' | 'finished';

/**
 * Final-stage configuration.
 *
 * Makes stage shot counts, elimination intervals, and capacity configurable.
 * Defaults follow the ISSF 10m Air Rifle Final.
 */
export interface FinalStageConfig {
  /** Stage 1 shot count (default: 10). */
  readonly stage1TotalShots: number;
  /** Stage 2 shot count (default: 14). */
  readonly stage2TotalShots: number;
  /** Shots per Stage 2 elimination series (default: 2). */
  readonly stage2ShotsPerSeries: number;
  /** Maximum participant count (default: 8). */
  readonly maxParticipants: number;
}

const DEFAULT_CONFIG: FinalStageConfig = {
  stage1TotalShots: 10,
  stage2TotalShots: 14,
  stage2ShotsPerSeries: 2,
  maxParticipants: 8,
};

/**
 * Final-round result entity.
 *
 * Uses a different structure from qualification Result. Shot counts and elimination intervals
 * are configurable through {@link FinalStageConfig}; the default is 10 + 14 shots.
 */
export class FinalResult {
  private constructor(
    public readonly id: FinalResultId,
    public readonly eventId: EventId,
    public readonly participantId: ParticipantId,
    public readonly playerName: string,
    public readonly affiliation: string,
    public readonly firingPointNumber: number,
    public readonly stage1Shots: readonly number[],
    public readonly stage1Total: number,
    public readonly stage2Shots: readonly number[],
    public readonly stage2Total: number,
    public readonly totalScore: number,
    public readonly finalRank: number,
    public readonly eliminatedAtShot: number | undefined,
    public readonly shootoffId: string | undefined,
    public readonly remarks: string,
    public readonly status: FinalResultStatus,
    public readonly stageConfig: FinalStageConfig = DEFAULT_CONFIG,
  ) {}

  /**
   * Creates a new result.
   */
  static create(
    id: FinalResultId,
    eventId: EventId,
    participantId: ParticipantId,
    playerName: string,
    affiliation: string,
    firingPointNumber: number,
    stageConfig: FinalStageConfig = DEFAULT_CONFIG,
  ): FinalResult {
    if (firingPointNumber < 1 || firingPointNumber > stageConfig.maxParticipants) {
      throw new Error(
        `firingPointNumber must be between 1 and ${stageConfig.maxParticipants}, got ${firingPointNumber}`,
      );
    }

    return new FinalResult(
      id,
      eventId,
      participantId,
      playerName,
      affiliation,
      firingPointNumber,
      Object.freeze([]),
      0,
      Object.freeze([]),
      0,
      0,
      0,
      undefined,
      undefined,
      '',
      'in_progress',
      stageConfig,
    );
  }

  /**
   * Restores a persisted result.
   */
  static reconstruct(
    id: FinalResultId,
    eventId: EventId,
    participantId: ParticipantId,
    playerName: string,
    affiliation: string,
    firingPointNumber: number,
    stage1Shots: number[],
    stage1Total: number,
    stage2Shots: number[],
    stage2Total: number,
    totalScore: number,
    finalRank: number,
    eliminatedAtShot: number | undefined,
    shootoffId: string | undefined,
    remarks: string,
    status: FinalResultStatus,
    stageConfig: FinalStageConfig = DEFAULT_CONFIG,
  ): FinalResult {
    return new FinalResult(
      id,
      eventId,
      participantId,
      playerName,
      affiliation,
      firingPointNumber,
      Object.freeze([...stage1Shots]),
      stage1Total,
      Object.freeze([...stage2Shots]),
      stage2Total,
      totalScore,
      finalRank,
      eliminatedAtShot,
      shootoffId,
      remarks,
      status,
      stageConfig,
    );
  }

  /**
   * Adds a Stage 1 shot.
   * @param score Score from 0.0 to 10.9.
   * @returns A new FinalResult.
   */
  addStage1Shot(score: number): FinalResult {
    if (this.stage1Shots.length >= this.stageConfig.stage1TotalShots) {
      throw new Error(`Stage 1 is already complete (${this.stageConfig.stage1TotalShots} shots)`);
    }
    if (score < 0 || score > 10.9) {
      throw new Error(`Invalid score: ${score}. Must be between 0 and 10.9`);
    }

    const newStage1Shots = [...this.stage1Shots, score];
    const newStage1Total = newStage1Shots.reduce((sum, s) => sum + s, 0);
    const newTotalScore = newStage1Total + this.stage2Total;

    return new FinalResult(
      this.id,
      this.eventId,
      this.participantId,
      this.playerName,
      this.affiliation,
      this.firingPointNumber,
      Object.freeze(newStage1Shots),
      newStage1Total,
      this.stage2Shots,
      this.stage2Total,
      newTotalScore,
      this.finalRank,
      this.eliminatedAtShot,
      this.shootoffId,
      this.remarks,
      this.status,
      this.stageConfig,
    );
  }

  /**
   * Adds a Stage 2 shot.
   * @param score Score from 0.0 to 10.9.
   * @returns A new FinalResult.
   */
  addStage2Shot(score: number): FinalResult {
    if (this.stage1Shots.length < this.stageConfig.stage1TotalShots) {
      throw new Error('Stage 1 must be complete before adding Stage 2 shots');
    }
    if (this.stage2Shots.length >= this.stageConfig.stage2TotalShots) {
      throw new Error(`Stage 2 is already complete (${this.stageConfig.stage2TotalShots} shots)`);
    }
    if (this.status === 'eliminated') {
      throw new Error('Cannot add shots to an eliminated participant');
    }
    if (this.status === 'finished') {
      throw new Error('Cannot add shots to a finished result');
    }
    if (score < 0 || score > 10.9) {
      throw new Error(`Invalid score: ${score}. Must be between 0 and 10.9`);
    }

    const newStage2Shots = [...this.stage2Shots, score];
    const newStage2Total = newStage2Shots.reduce((sum, s) => sum + s, 0);
    const newTotalScore = this.stage1Total + newStage2Total;

    return new FinalResult(
      this.id,
      this.eventId,
      this.participantId,
      this.playerName,
      this.affiliation,
      this.firingPointNumber,
      this.stage1Shots,
      this.stage1Total,
      Object.freeze(newStage2Shots),
      newStage2Total,
      newTotalScore,
      this.finalRank,
      this.eliminatedAtShot,
      this.shootoffId,
      this.remarks,
      this.status,
      this.stageConfig,
    );
  }

  /**
   * Marks the participant as eliminated.
   * @param shotNumber Absolute shot number at a Stage 2 series boundary.
   * @param rank Rank at elimination.
   * @returns A new FinalResult.
   */
  eliminate(shotNumber: number, rank: number): FinalResult {
    // Eliminations occur at Stage 2 series boundaries.
    const stage2Start = this.stageConfig.stage1TotalShots;
    const stage2ShotsCount = shotNumber - stage2Start;
    if (
      stage2ShotsCount < this.stageConfig.stage2ShotsPerSeries ||
      stage2ShotsCount > this.stageConfig.stage2TotalShots ||
      stage2ShotsCount % this.stageConfig.stage2ShotsPerSeries !== 0
    ) {
      const minShot = stage2Start + this.stageConfig.stage2ShotsPerSeries;
      const maxShot = stage2Start + this.stageConfig.stage2TotalShots;
      throw new Error(
        `Invalid elimination shot number: ${shotNumber}. Must be a multiple of ${this.stageConfig.stage2ShotsPerSeries} (offset from stage 1) between ${minShot} and ${maxShot}`,
      );
    }
    if (rank < 1 || rank > this.stageConfig.maxParticipants) {
      throw new Error(`Invalid rank: ${rank}. Must be between 1 and ${this.stageConfig.maxParticipants}`);
    }
    // shotNumber counts shots across both stages and must already have been reached.
    if (this.totalShotsCount < shotNumber) {
      throw new Error(
        `Cannot eliminate at shot ${shotNumber}: participant has only fired ${this.totalShotsCount} shots`,
      );
    }

    return new FinalResult(
      this.id,
      this.eventId,
      this.participantId,
      this.playerName,
      this.affiliation,
      this.firingPointNumber,
      this.stage1Shots,
      this.stage1Total,
      this.stage2Shots,
      this.stage2Total,
      this.totalScore,
      rank,
      shotNumber,
      this.shootoffId,
      this.remarks,
      'eliminated',
      this.stageConfig,
    );
  }

  /**
   * Sets the final rank.
   * @param rank Rank from 1 through maxParticipants.
   * @returns A new FinalResult.
   */
  setFinalRank(rank: number): FinalResult {
    if (rank < 1 || rank > this.stageConfig.maxParticipants) {
      throw new Error(`Invalid rank: ${rank}. Must be between 1 and ${this.stageConfig.maxParticipants}`);
    }

    const newStatus: FinalResultStatus = this.status === 'eliminated' ? 'eliminated' : 'finished';

    return new FinalResult(
      this.id,
      this.eventId,
      this.participantId,
      this.playerName,
      this.affiliation,
      this.firingPointNumber,
      this.stage1Shots,
      this.stage1Total,
      this.stage2Shots,
      this.stage2Total,
      this.totalScore,
      rank,
      this.eliminatedAtShot,
      this.shootoffId,
      this.remarks,
      newStatus,
      this.stageConfig,
    );
  }

  /**
   * Sets the shoot-off ID.
   * @param shootoffId Shoot-off ID.
   * @returns A new FinalResult.
   */
  setShootoffId(shootoffId: string): FinalResult {
    return new FinalResult(
      this.id,
      this.eventId,
      this.participantId,
      this.playerName,
      this.affiliation,
      this.firingPointNumber,
      this.stage1Shots,
      this.stage1Total,
      this.stage2Shots,
      this.stage2Total,
      this.totalScore,
      this.finalRank,
      this.eliminatedAtShot,
      shootoffId,
      this.remarks,
      this.status,
      this.stageConfig,
    );
  }

  /**
   * Sets result remarks.
   * @param remarks Remarks such as DNS, DNF, or DQ.
   * @returns A new FinalResult.
   */
  setRemarks(remarks: string): FinalResult {
    return new FinalResult(
      this.id,
      this.eventId,
      this.participantId,
      this.playerName,
      this.affiliation,
      this.firingPointNumber,
      this.stage1Shots,
      this.stage1Total,
      this.stage2Shots,
      this.stage2Total,
      this.totalScore,
      this.finalRank,
      this.eliminatedAtShot,
      this.shootoffId,
      remarks,
      this.status,
      this.stageConfig,
    );
  }

  /**
   * Compares results for ranking.
   * @param other Result to compare.
   * @returns Negative when this ranks higher, zero for a tie, positive when other ranks higher.
   *
   * Compares total, then Stage 2 shots in reverse order, then Stage 1 shots in reverse order.
   */
  compareTo(other: FinalResult): number {
    // 1. Compare totals descending.
    if (this.totalScore !== other.totalScore) {
      return other.totalScore - this.totalScore;
    }

    // 2. Compare Stage 2 shots in reverse order, descending.
    const maxStage2Length = Math.max(this.stage2Shots.length, other.stage2Shots.length);
    for (let i = maxStage2Length - 1; i >= 0; i--) {
      const thisShot = this.stage2Shots[i] ?? 0;
      const otherShot = other.stage2Shots[i] ?? 0;
      if (thisShot !== otherShot) {
        return otherShot - thisShot;
      }
    }

    // 3. Compare Stage 1 shots in reverse order, descending.
    for (let i = this.stageConfig.stage1TotalShots - 1; i >= 0; i--) {
      const thisShot = this.stage1Shots[i] ?? 0;
      const otherShot = other.stage1Shots[i] ?? 0;
      if (thisShot !== otherShot) {
        return otherShot - thisShot;
      }
    }

    // Exact tie.
    return 0;
  }

  /**
   * Current total shot count.
   */
  get totalShotsCount(): number {
    return this.stage1Shots.length + this.stage2Shots.length;
  }

  /**
   * Whether Stage 1 is complete.
   */
  get isStage1Complete(): boolean {
    return this.stage1Shots.length >= this.stageConfig.stage1TotalShots;
  }

  /**
   * Whether Stage 2 is complete.
   */
  get isStage2Complete(): boolean {
    return this.stage2Shots.length >= this.stageConfig.stage2TotalShots || this.status === 'eliminated';
  }

  /**
   * Whether every stage is complete.
   */
  get isComplete(): boolean {
    return this.isStage1Complete && this.isStage2Complete;
  }
}

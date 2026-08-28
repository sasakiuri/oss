import { ResultId } from './ResultId';
import { EventId, ParticipantId } from '@/main/modules/championship';
import { Logger } from '@/shared/utils/Logger';
import type { IRankable } from './IRankable';
import {
  Result as ResultUtil,
  type Result as ResultType,
  type ParseError,
  createParseError,
} from '@/shared/types/Result';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import type { RankingShotEvidence, ResultFormat } from '@/shared/competitionTypes';

const logger = Logger.create('Result');

export type ResultStatus = 'published' | 'confirmed';

/**
 * Qualification result entity. An optional ResultFormat configures series and shot counts;
 * the backward-compatible default is six series and 60 shots.
 *
 * @limitation The database still has series1-series6 columns; arbitrary series counts require a JSON migration.
 */
export class Result implements IRankable<Result> {
  private _shotsCache: readonly number[] | null = null;
  private readonly shotsJson: string | null;

  private constructor(
    public readonly id: ResultId,
    public readonly eventId: EventId,
    public readonly participantId: ParticipantId,
    public readonly playerName: string,
    public readonly affiliation: string,
    public readonly totalScore: number,
    public readonly seriesScores: readonly number[],
    shots: readonly number[] | null,
    public readonly relayNumber: number,
    public readonly confirmedAt: Date,
    public readonly status: ResultStatus,
    public readonly sourceCompetitionId: string | null = null,
    public readonly familyName: string = playerName,
    public readonly sourceLaneId: string | null = null,
    public readonly rankingShots: readonly RankingShotEvidence[] = Object.freeze([]),
    shotsJson: string | null = null,
  ) {
    this._shotsCache = shots;
    this.shotsJson = shotsJson;
  }

  /**
   * Gets shot data, returning an empty array on parse failure for backward compatibility.
   *
   * @deprecated Use tryParseShots() when parse errors must be handled.
   */
  get shots(): readonly number[] {
    const result = this.tryParseShots();
    if (result.success) {
      return result.data;
    }
    // tryParseShots has already logged the failure.
    return Object.freeze([]);
  }

  /**
   * Gets shot data as a Result.
   *
   * @returns Shot array on success or ParseError on failure.
   */
  tryParseShots(): ResultType<readonly number[], ParseError> {
    // Return cached shots when available.
    if (this._shotsCache) {
      return ResultUtil.ok(this._shotsCache);
    }

    // Missing shotsJson is a valid empty result.
    if (!this.shotsJson) {
      const emptyShots = Object.freeze([]) as readonly number[];
      return ResultUtil.ok(emptyShots);
    }

    // Parse JSON.
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.shotsJson);
    } catch (error) {
      const parseError = createParseError(
        ErrorCatalog.PARSE.JSON_SYNTAX_ERROR.code,
        ErrorCatalog.PARSE.JSON_SYNTAX_ERROR.message,
        {
          resultId: this.id.value,
          shotsJson: this.shotsJson,
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
      logger.error('Failed to parse shots JSON', parseError.context);
      return ResultUtil.err(parseError);
    }

    // Verify the parsed value is an array.
    if (!Array.isArray(parsed)) {
      const parseError = createParseError(
        ErrorCatalog.PARSE.SHOTS_ARRAY_EXPECTED.code,
        ErrorCatalog.PARSE.SHOTS_ARRAY_EXPECTED.message,
        {
          resultId: this.id.value,
          actualType: typeof parsed,
          shotsJson: this.shotsJson,
        },
      );
      logger.warn('Invalid shots JSON format: expected array', parseError.context);
      return ResultUtil.err(parseError);
    }

    // Verify every element is a number.
    if (!parsed.every((v): v is number => typeof v === 'number')) {
      const invalidElements = parsed
        .map((v, i) => ({ index: i, type: typeof v, value: v }))
        .filter((e) => e.type !== 'number');
      const parseError = createParseError(
        ErrorCatalog.PARSE.INVALID_NUMBER.code,
        ErrorCatalog.PARSE.INVALID_NUMBER.message,
        {
          resultId: this.id.value,
          invalidElements: invalidElements.slice(0, 3), // Include only the first three.
          totalInvalid: invalidElements.length,
        },
      );
      logger.warn('Invalid shots JSON format: contains non-number elements', parseError.context);
      return ResultUtil.err(parseError);
    }

    // Pad to 60 elements.
    while (parsed.length < 60) {
      parsed.push(0);
    }

    this._shotsCache = Object.freeze(parsed);
    return ResultUtil.ok(this._shotsCache);
  }

  static create(
    id: ResultId,
    eventId: EventId,
    participantId: ParticipantId,
    playerName: string,
    affiliation: string,
    totalScore: number,
    seriesScores: number[],
    shots: number[],
    relayNumber: number,
    status: ResultStatus = 'published',
    format?: ResultFormat,
    sourceCompetitionId: string | null = null,
    familyName: string = playerName,
    sourceLaneId: string | null = null,
    rankingShots: readonly RankingShotEvidence[] = [],
  ): Result {
    const maxSeries = format?.totalSeries ?? 6;
    const maxShots = format?.totalShots ?? 60;

    if (seriesScores.length > maxSeries) {
      throw new Error(`seriesScores must have at most ${maxSeries} elements, got ${seriesScores.length}`);
    }
    if (shots.length > maxShots) {
      throw new Error(`shots must have at most ${maxShots} elements, got ${shots.length}`);
    }

    // Pad to required length if needed
    const paddedSeriesScores = [...seriesScores];
    while (paddedSeriesScores.length < maxSeries) {
      paddedSeriesScores.push(0);
    }
    const paddedShots = [...shots];
    while (paddedShots.length < maxShots) {
      paddedShots.push(0);
    }

    return new Result(
      id,
      eventId,
      participantId,
      playerName,
      affiliation,
      totalScore,
      Object.freeze(paddedSeriesScores),
      Object.freeze(paddedShots),
      relayNumber,
      new Date(),
      status,
      sourceCompetitionId,
      familyName.trim() || playerName.trim(),
      sourceLaneId,
      freezeRankingShots(rankingShots),
    );
  }

  static reconstruct(
    id: ResultId,
    eventId: EventId,
    participantId: ParticipantId,
    playerName: string,
    affiliation: string,
    totalScore: number,
    seriesScores: number[],
    shots: number[],
    relayNumber: number,
    confirmedAt: Date,
    status: ResultStatus,
    sourceCompetitionId: string | null = null,
    familyName: string = playerName,
    sourceLaneId: string | null = null,
    rankingShots: readonly RankingShotEvidence[] = [],
  ): Result {
    return new Result(
      id,
      eventId,
      participantId,
      playerName,
      affiliation,
      totalScore,
      Object.freeze([...seriesScores]),
      Object.freeze([...shots]),
      relayNumber,
      confirmedAt,
      status,
      sourceCompetitionId,
      familyName || playerName,
      sourceLaneId,
      freezeRankingShots(rankingShots),
    );
  }

  /**
   * Reconstructs a Result from JSON and defers shot parsing until first access.
   */
  static reconstructFromJson(
    id: ResultId,
    eventId: EventId,
    participantId: ParticipantId,
    playerName: string,
    affiliation: string,
    totalScore: number,
    seriesScores: number[],
    shotsJson: string,
    relayNumber: number,
    confirmedAt: Date,
    status: ResultStatus,
    sourceCompetitionId: string | null = null,
    familyName: string = playerName,
    sourceLaneId: string | null = null,
    rankingShots: readonly RankingShotEvidence[] = [],
  ): Result {
    return new Result(
      id,
      eventId,
      participantId,
      playerName,
      affiliation,
      totalScore,
      Object.freeze([...seriesScores]),
      null,
      relayNumber,
      confirmedAt,
      status,
      sourceCompetitionId,
      familyName || playerName,
      sourceLaneId,
      freezeRankingShots(rankingShots),
      shotsJson,
    );
  }

  /**
   * Returns a new Result with confirmed status.
   */
  confirm(): Result {
    return new Result(
      this.id,
      this.eventId,
      this.participantId,
      this.playerName,
      this.affiliation,
      this.totalScore,
      this.seriesScores,
      this.shots,
      this.relayNumber,
      this.confirmedAt,
      'confirmed',
      this.sourceCompetitionId,
      this.familyName,
      this.sourceLaneId,
      this.rankingShots,
    );
  }

  /**
   * Compares results for ranking.
   * @param other Result to compare.
   * @returns Negative when this ranks higher, zero for a tie, positive when other ranks higher.
   *
   * Compares total, then series in reverse order, then shots in reverse order.
   *
   * Arrays are padded by create(), so comparison uses their actual lengths.
   */
  compareTo(other: Result): number {
    // 1. Compare totals descending.
    if (this.totalScore !== other.totalScore) {
      return other.totalScore - this.totalScore;
    }

    // 2. Compare series in reverse order, descending.
    for (let i = this.seriesScores.length - 1; i >= 0; i--) {
      const thisScore = this.seriesScores[i] ?? 0;
      const otherScore = other.seriesScores[i] ?? 0;
      if (thisScore !== otherScore) {
        return otherScore - thisScore;
      }
    }

    // 3. Compare shots in reverse order, descending.
    const thisShots = this.shots;
    const otherShots = other.shots;
    for (let i = thisShots.length - 1; i >= 0; i--) {
      const thisShot = thisShots[i] ?? 0;
      const otherShot = otherShots[i] ?? 0;
      if (thisShot !== otherShot) {
        return otherShot - thisShot;
      }
    }

    // Exact tie.
    return 0;
  }
}

function freezeRankingShots(shots: readonly RankingShotEvidence[]): readonly RankingShotEvidence[] {
  return Object.freeze(shots.map((shot) => Object.freeze({ ...shot })));
}

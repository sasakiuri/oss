import { ShootoffId } from './ShootoffId';
import { ParticipantId } from '@/main/modules/championship';
import { Score } from '@/main/modules/lane-control';
import { DomainError, ErrorCatalog } from '@/shared/errors';

/**
 * One shot in a shoot-off.
 */
export interface ShootoffShot {
  readonly participantId: ParticipantId;
  readonly roundNumber: number;
  readonly score: Score;
}

/**
 * One shoot-off round in which every participant fires once.
 */
export interface ShootoffRound {
  readonly roundNumber: number;
  readonly shots: readonly ShootoffShot[];
}

/**
 * Final shoot-off entity.
 *
 * Manages additional rounds used to rank tied participants until the tie is resolved.
 */
export class FinalShootoff {
  private constructor(
    public readonly id: ShootoffId,
    public readonly targetParticipantIds: readonly ParticipantId[],
    public readonly contestedRank: number,
    public readonly rounds: readonly ShootoffRound[],
    public readonly resolvedRanks: ReadonlyMap<string, number> | undefined,
    public readonly isResolved: boolean,
  ) {}

  /**
   * Creates a shoot-off.
   * @param targetParticipantIds At least two participant IDs.
   * @param contestedRank Rank being contested.
   */
  static create(targetParticipantIds: ParticipantId[], contestedRank: number): FinalShootoff {
    if (targetParticipantIds.length < 2) {
      throw DomainError.from(ErrorCatalog.SHOOTOFF.INSUFFICIENT_PARTICIPANTS);
    }

    const participantIds = new Set(targetParticipantIds.map((participantId) => participantId.value));
    if (participantIds.size !== targetParticipantIds.length) {
      throw DomainError.from(ErrorCatalog.SHOOTOFF.DUPLICATE_PARTICIPANTS);
    }

    if (contestedRank < 1) {
      throw DomainError.from(ErrorCatalog.SHOOTOFF.INVALID_RANK);
    }

    return new FinalShootoff(
      ShootoffId.generate(),
      Object.freeze([...targetParticipantIds]),
      contestedRank,
      Object.freeze([]),
      undefined,
      false,
    );
  }

  /**
   * Restores persisted state.
   */
  static reconstruct(
    id: ShootoffId,
    targetParticipantIds: ParticipantId[],
    contestedRank: number,
    rounds: ShootoffRound[],
    resolvedRanks: Map<string, number> | undefined,
    isResolved: boolean,
  ): FinalShootoff {
    return new FinalShootoff(
      id,
      Object.freeze([...targetParticipantIds]),
      contestedRank,
      Object.freeze(rounds.map((r) => ({ ...r, shots: Object.freeze([...r.shots]) }))),
      resolvedRanks ? new Map(resolvedRanks) : undefined,
      isResolved,
    );
  }

  /**
   * Adds a round containing one shot per participant.
   * @returns A new FinalShootoff.
   */
  addRound(shots: ShootoffShot[]): FinalShootoff {
    if (this.isResolved) {
      throw DomainError.from(ErrorCatalog.SHOOTOFF.ALREADY_RESOLVED);
    }

    // Collect participant IDs represented by shots.
    const shotParticipantIds = new Set(shots.map((s) => s.participantId.value));

    // Different shot and unique-ID counts indicate a duplicate participant.
    if (shots.length !== shotParticipantIds.size) {
      throw DomainError.from(ErrorCatalog.SHOOTOFF.DUPLICATE_PARTICIPANTS);
    }

    // Reject ineligible participants.
    const targetIds = new Set(this.targetParticipantIds.map((pid) => pid.value));
    for (const id of shotParticipantIds) {
      if (!targetIds.has(id)) {
        throw DomainError.from(ErrorCatalog.SHOOTOFF.EXTRA_PARTICIPANTS);
      }
    }

    // Verify every target participant has a shot.
    const allParticipantsHaveShot = this.targetParticipantIds.every((pid) => shotParticipantIds.has(pid.value));

    if (!allParticipantsHaveShot) {
      throw DomainError.from(ErrorCatalog.SHOOTOFF.INCOMPLETE_ROUND);
    }

    // Verify the shot count matches the participant count.
    if (shotParticipantIds.size !== this.targetParticipantIds.length) {
      throw DomainError.from(ErrorCatalog.SHOOTOFF.INCOMPLETE_ROUND);
    }

    const nextRoundNumber = this.rounds.length + 1;
    const newRound: ShootoffRound = {
      roundNumber: nextRoundNumber,
      shots: Object.freeze(
        shots.map((s) => ({
          ...s,
          roundNumber: nextRoundNumber,
        })),
      ),
    };

    const newRounds = Object.freeze([...this.rounds, newRound]);

    return new FinalShootoff(
      this.id,
      this.targetParticipantIds,
      this.contestedRank,
      newRounds,
      this.resolvedRanks,
      this.isResolved,
    );
  }

  /**
   * Resolves ranks from the current rounds.
   * @returns A new FinalShootoff with resolved ranks when no top-score tie remains.
   */
  resolveRanks(): FinalShootoff {
    if (this.isResolved) {
      throw DomainError.from(ErrorCatalog.SHOOTOFF.ALREADY_RESOLVED);
    }

    if (this.rounds.length === 0) {
      throw DomainError.from(ErrorCatalog.SHOOTOFF.NO_ROUNDS);
    }

    // Calculate totals for each participant.
    const participantScores = this.calculateParticipantScores();

    // Sort by score before assigning ranks.
    const sortedParticipants = [...participantScores.entries()].sort((a, b) => b[1] - a[1]);

    // A tie for the highest score remains unresolved.
    const topEntry = sortedParticipants[0];
    if (!topEntry) {
      throw DomainError.from(ErrorCatalog.SHOOTOFF.NO_ROUNDS);
    }
    const topScore = topEntry[1];
    const topScorerCount = sortedParticipants.filter(([, score]) => score === topScore).length;

    if (topScorerCount > 1) {
      // Return unresolved while a top-score tie remains.
      return new FinalShootoff(this.id, this.targetParticipantIds, this.contestedRank, this.rounds, undefined, false);
    }

    // Assign ranks.
    const resolvedRanks = new Map<string, number>();
    let currentRank = this.contestedRank;
    let previousScore: number | null = null;
    let sameRankCount = 0;

    for (const [participantId, score] of sortedParticipants) {
      if (previousScore !== null && score < previousScore) {
        currentRank += sameRankCount;
        sameRankCount = 1;
      } else {
        sameRankCount++;
      }
      resolvedRanks.set(participantId, currentRank);
      previousScore = score;
    }

    return new FinalShootoff(this.id, this.targetParticipantIds, this.contestedRank, this.rounds, resolvedRanks, true);
  }

  /**
   * Gets the current winner, or undefined when unresolved.
   */
  getWinner(): ParticipantId | undefined {
    if (!this.isResolved || !this.resolvedRanks) {
      return undefined;
    }

    // Find the participant with the lowest rank number.
    let winnerId: string | undefined;
    let minRank = Infinity;

    for (const [participantId, rank] of this.resolvedRanks) {
      if (rank < minRank) {
        minRank = rank;
        winnerId = participantId;
      }
    }

    if (!winnerId) {
      return undefined;
    }

    return this.targetParticipantIds.find((pid) => pid.value === winnerId);
  }

  /**
   * Gets a round by number.
   */
  getRound(roundNumber: number): ShootoffRound | undefined {
    return this.rounds.find((r) => r.roundNumber === roundNumber);
  }

  /**
   * Gets a participant's total score.
   */
  getParticipantTotalScore(participantId: ParticipantId): number {
    const scores = this.calculateParticipantScores();
    return scores.get(participantId.value) ?? 0;
  }

  /**
   * Gets the current round count.
   */
  get currentRoundNumber(): number {
    return this.rounds.length;
  }

  /**
   * Calculates totals for each participant.
   */
  private calculateParticipantScores(): Map<string, number> {
    const scores = new Map<string, number>();

    for (const participantId of this.targetParticipantIds) {
      scores.set(participantId.value, 0);
    }

    for (const round of this.rounds) {
      for (const shot of round.shots) {
        const currentScore = scores.get(shot.participantId.value) ?? 0;
        scores.set(shot.participantId.value, Math.round((currentScore + shot.score.value) * 10) / 10);
      }
    }

    return scores;
  }
}

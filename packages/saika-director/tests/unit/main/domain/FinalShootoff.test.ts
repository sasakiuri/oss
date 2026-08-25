import { describe, it, expect, beforeEach } from 'vitest';
import { FinalShootoff, type ShootoffShot } from '@/main/modules/shootoff';
import { ParticipantId } from '@/main/modules/championship';
import { Score } from '@/main/modules/lane-control';
import { DomainError } from '@/shared/errors';

describe('FinalShootoff', () => {
  let participant1: ParticipantId;
  let participant2: ParticipantId;
  let participant3: ParticipantId;

  beforeEach(() => {
    participant1 = ParticipantId.create('participant-1');
    participant2 = ParticipantId.create('participant-2');
    participant3 = ParticipantId.create('participant-3');
  });

  describe('create', () => {
    it('should create with 2 or more participants', () => {
      const shootoff = FinalShootoff.create([participant1, participant2], 3);

      expect(shootoff.targetParticipantIds.length).toBe(2);
      expect(shootoff.contestedRank).toBe(3);
      expect(shootoff.rounds.length).toBe(0);
      expect(shootoff.isResolved).toBe(false);
    });

    it('should create with 3 participants', () => {
      const shootoff = FinalShootoff.create([participant1, participant2, participant3], 5);

      expect(shootoff.targetParticipantIds.length).toBe(3);
      expect(shootoff.contestedRank).toBe(5);
    });

    it('should throw error with 1 participant', () => {
      expect(() => FinalShootoff.create([participant1], 3)).toThrow(DomainError);
    });

    it('should throw error with 0 participants', () => {
      expect(() => FinalShootoff.create([], 3)).toThrow(DomainError);
    });

    it('should reject duplicate participants', () => {
      expect(() => FinalShootoff.create([participant1, participant1], 3)).toThrowError(
        expect.objectContaining({ code: 'SHOOTOFF_008' }),
      );
    });

    it('should throw error with invalid rank (0)', () => {
      expect(() => FinalShootoff.create([participant1, participant2], 0)).toThrow(DomainError);
    });

    it('should throw error with invalid rank (negative)', () => {
      expect(() => FinalShootoff.create([participant1, participant2], -1)).toThrow(DomainError);
    });
  });

  describe('addRound', () => {
    it('should add a round with all participants shots', () => {
      const shootoff = FinalShootoff.create([participant1, participant2], 3);

      const shots: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.3) },
        { participantId: participant2, roundNumber: 1, score: Score.create(10.1) },
      ];

      const updatedShootoff = shootoff.addRound(shots);

      expect(updatedShootoff.rounds.length).toBe(1);
      expect(updatedShootoff.rounds[0]!.roundNumber).toBe(1);
      expect(updatedShootoff.rounds[0]!.shots.length).toBe(2);
    });

    it('should add multiple rounds', () => {
      let shootoff = FinalShootoff.create([participant1, participant2], 3);

      const shots1: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.0) },
        { participantId: participant2, roundNumber: 1, score: Score.create(10.0) },
      ];
      shootoff = shootoff.addRound(shots1);

      const shots2: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 2, score: Score.create(10.5) },
        { participantId: participant2, roundNumber: 2, score: Score.create(10.3) },
      ];
      shootoff = shootoff.addRound(shots2);

      expect(shootoff.rounds.length).toBe(2);
      expect(shootoff.currentRoundNumber).toBe(2);
    });

    it('should throw error when not all participants have shots', () => {
      const shootoff = FinalShootoff.create([participant1, participant2], 3);

      const incompleteShots: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.0) },
      ];

      expect(() => shootoff.addRound(incompleteShots)).toThrow(DomainError);
    });

    it('should throw error when shootoff is already resolved', () => {
      let shootoff = FinalShootoff.create([participant1, participant2], 3);

      const shots: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.5) },
        { participantId: participant2, roundNumber: 1, score: Score.create(10.0) },
      ];
      shootoff = shootoff.addRound(shots);
      shootoff = shootoff.resolveRanks();

      const moreShots: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 2, score: Score.create(10.0) },
        { participantId: participant2, roundNumber: 2, score: Score.create(10.0) },
      ];

      expect(() => shootoff.addRound(moreShots)).toThrow(DomainError);
    });
  });

  describe('resolveRanks', () => {
    it('should determine winner with single highest score', () => {
      let shootoff = FinalShootoff.create([participant1, participant2], 3);

      const shots: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.5) },
        { participantId: participant2, roundNumber: 1, score: Score.create(10.0) },
      ];
      shootoff = shootoff.addRound(shots);
      shootoff = shootoff.resolveRanks();

      expect(shootoff.isResolved).toBe(true);
      expect(shootoff.resolvedRanks?.get(participant1.value)).toBe(3);
      expect(shootoff.resolvedRanks?.get(participant2.value)).toBe(4);
    });

    it('should remain unresolved with tied scores', () => {
      let shootoff = FinalShootoff.create([participant1, participant2], 3);

      const shots: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.0) },
        { participantId: participant2, roundNumber: 1, score: Score.create(10.0) },
      ];
      shootoff = shootoff.addRound(shots);
      shootoff = shootoff.resolveRanks();

      expect(shootoff.isResolved).toBe(false);
      expect(shootoff.resolvedRanks).toBeUndefined();
    });

    it('should throw error when no rounds exist', () => {
      const shootoff = FinalShootoff.create([participant1, participant2], 3);
      expect(() => shootoff.resolveRanks()).toThrow(DomainError);
    });

    it('should throw error when already resolved', () => {
      let shootoff = FinalShootoff.create([participant1, participant2], 3);

      const shots: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.5) },
        { participantId: participant2, roundNumber: 1, score: Score.create(10.0) },
      ];
      shootoff = shootoff.addRound(shots);
      shootoff = shootoff.resolveRanks();

      expect(() => shootoff.resolveRanks()).toThrow(DomainError);
    });

    it('should resolve after multiple rounds when tie is broken', () => {
      let shootoff = FinalShootoff.create([participant1, participant2], 3);

      // Round 1: tie
      const shots1: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.0) },
        { participantId: participant2, roundNumber: 1, score: Score.create(10.0) },
      ];
      shootoff = shootoff.addRound(shots1);
      shootoff = shootoff.resolveRanks();
      expect(shootoff.isResolved).toBe(false);

      // Round 2: participant1 wins
      const shots2: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 2, score: Score.create(10.5) },
        { participantId: participant2, roundNumber: 2, score: Score.create(9.8) },
      ];
      shootoff = shootoff.addRound(shots2);
      shootoff = shootoff.resolveRanks();

      expect(shootoff.isResolved).toBe(true);
      // Total: participant1 = 20.5, participant2 = 19.8
      expect(shootoff.resolvedRanks?.get(participant1.value)).toBe(3);
      expect(shootoff.resolvedRanks?.get(participant2.value)).toBe(4);
    });
  });

  describe('getWinner', () => {
    it('should return winner after resolution', () => {
      let shootoff = FinalShootoff.create([participant1, participant2], 3);

      const shots: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.5) },
        { participantId: participant2, roundNumber: 1, score: Score.create(10.0) },
      ];
      shootoff = shootoff.addRound(shots);
      shootoff = shootoff.resolveRanks();

      const winner = shootoff.getWinner();
      expect(winner).toBeDefined();
      expect(winner?.value).toBe(participant1.value);
    });

    it('should return undefined when not resolved', () => {
      const shootoff = FinalShootoff.create([participant1, participant2], 3);
      expect(shootoff.getWinner()).toBeUndefined();
    });

    it('should return undefined when tied', () => {
      let shootoff = FinalShootoff.create([participant1, participant2], 3);

      const shots: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.0) },
        { participantId: participant2, roundNumber: 1, score: Score.create(10.0) },
      ];
      shootoff = shootoff.addRound(shots);
      shootoff = shootoff.resolveRanks();

      expect(shootoff.getWinner()).toBeUndefined();
    });
  });

  describe('getParticipantTotalScore', () => {
    it('should return 0 when no rounds', () => {
      const shootoff = FinalShootoff.create([participant1, participant2], 3);
      expect(shootoff.getParticipantTotalScore(participant1)).toBe(0);
    });

    it('should return correct total after one round', () => {
      let shootoff = FinalShootoff.create([participant1, participant2], 3);

      const shots: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.5) },
        { participantId: participant2, roundNumber: 1, score: Score.create(10.0) },
      ];
      shootoff = shootoff.addRound(shots);

      expect(shootoff.getParticipantTotalScore(participant1)).toBe(10.5);
      expect(shootoff.getParticipantTotalScore(participant2)).toBe(10.0);
    });

    it('should return correct total after multiple rounds', () => {
      let shootoff = FinalShootoff.create([participant1, participant2], 3);

      const shots1: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.0) },
        { participantId: participant2, roundNumber: 1, score: Score.create(9.5) },
      ];
      shootoff = shootoff.addRound(shots1);

      const shots2: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 2, score: Score.create(10.5) },
        { participantId: participant2, roundNumber: 2, score: Score.create(10.3) },
      ];
      shootoff = shootoff.addRound(shots2);

      expect(shootoff.getParticipantTotalScore(participant1)).toBe(20.5);
      expect(shootoff.getParticipantTotalScore(participant2)).toBe(19.8);
    });

    it('should return 0 for non-participant', () => {
      const shootoff = FinalShootoff.create([participant1, participant2], 3);
      expect(shootoff.getParticipantTotalScore(participant3)).toBe(0);
    });
  });

  describe('getRound', () => {
    it('should return round by number', () => {
      let shootoff = FinalShootoff.create([participant1, participant2], 3);

      const shots: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.0) },
        { participantId: participant2, roundNumber: 1, score: Score.create(9.0) },
      ];
      shootoff = shootoff.addRound(shots);

      const round = shootoff.getRound(1);
      expect(round).toBeDefined();
      expect(round?.roundNumber).toBe(1);
      expect(round?.shots.length).toBe(2);
    });

    it('should return undefined for non-existent round', () => {
      const shootoff = FinalShootoff.create([participant1, participant2], 3);
      expect(shootoff.getRound(1)).toBeUndefined();
    });
  });

  describe('currentRoundNumber', () => {
    it('should return 0 when no rounds', () => {
      const shootoff = FinalShootoff.create([participant1, participant2], 3);
      expect(shootoff.currentRoundNumber).toBe(0);
    });

    it('should return correct round number', () => {
      let shootoff = FinalShootoff.create([participant1, participant2], 3);

      const shots1: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 1, score: Score.create(10.0) },
        { participantId: participant2, roundNumber: 1, score: Score.create(10.0) },
      ];
      shootoff = shootoff.addRound(shots1);
      expect(shootoff.currentRoundNumber).toBe(1);

      const shots2: ShootoffShot[] = [
        { participantId: participant1, roundNumber: 2, score: Score.create(10.0) },
        { participantId: participant2, roundNumber: 2, score: Score.create(10.0) },
      ];
      shootoff = shootoff.addRound(shots2);
      expect(shootoff.currentRoundNumber).toBe(2);
    });
  });
});

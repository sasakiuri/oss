import { describe, it, expect } from 'vitest';
import { Result as ResultEntity } from '@/main/modules/results';
import { ResultId } from '@/main/modules/results';
import { EventId, ParticipantId } from '@/main/modules/championship';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

describe('Result Entity', () => {
  const createResultId = () => ResultId.create(crypto.randomUUID());
  const createEventId = () => EventId.create(crypto.randomUUID());
  const createParticipantId = () => ParticipantId.create(crypto.randomUUID());

  describe('create', () => {
    it('should create result with shots', () => {
      const shots = [10.5, 10.2, 9.8];
      const result = ResultEntity.create(
        createResultId(),
        createEventId(),
        createParticipantId(),
        'Test Player',
        'Test Team',
        30.5,
        [10.5, 10.0, 10.0],
        shots,
        1,
      );

      expect(result.playerName).toBe('Test Player');
      expect(result.shots.length).toBe(60); // Padded to 60
      expect(result.shots[0]).toBe(10.5);
      expect(result.shots[1]).toBe(10.2);
      expect(result.shots[2]).toBe(9.8);
    });
  });

  describe('tryParseShots', () => {
    it('should return ok with shots when cached', () => {
      const shots = [10.5, 10.2, 9.8];
      const result = ResultEntity.create(
        createResultId(),
        createEventId(),
        createParticipantId(),
        'Test Player',
        'Test Team',
        30.5,
        [10.5, 10.0, 10.0],
        shots,
        1,
      );

      const parseResult = result.tryParseShots();
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.length).toBe(60);
        expect(parseResult.data[0]).toBe(10.5);
      }
    });

    it('should return ok with empty array when no shotsJson', () => {
      const result = ResultEntity.reconstruct(
        createResultId(),
        createEventId(),
        createParticipantId(),
        'Test Player',
        'Test Team',
        30.5,
        [10.5, 10.0, 10.0],
        [], // Empty shots
        1,
        new Date(),
        'published',
      );

      const parseResult = result.tryParseShots();
      expect(parseResult.success).toBe(true);
    });

    it('should return ok when parsing valid JSON', () => {
      const result = ResultEntity.reconstructFromJson(
        createResultId(),
        createEventId(),
        createParticipantId(),
        'Test Player',
        'Test Team',
        30.5,
        [10.5, 10.0, 10.0],
        JSON.stringify([10.5, 10.2, 9.8]),
        1,
        new Date(),
        'published',
      );

      const parseResult = result.tryParseShots();
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.length).toBe(60);
        expect(parseResult.data[0]).toBe(10.5);
      }
    });

    it('should return err for invalid JSON syntax', () => {
      const result = ResultEntity.reconstructFromJson(
        createResultId(),
        createEventId(),
        createParticipantId(),
        'Test Player',
        'Test Team',
        30.5,
        [10.5, 10.0, 10.0],
        'invalid json {{{',
        1,
        new Date(),
        'published',
      );

      const parseResult = result.tryParseShots();
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        expect(parseResult.error.code).toBe(ErrorCatalog.PARSE.JSON_SYNTAX_ERROR.code);
      }
    });

    it('should return err when JSON is not an array', () => {
      const result = ResultEntity.reconstructFromJson(
        createResultId(),
        createEventId(),
        createParticipantId(),
        'Test Player',
        'Test Team',
        30.5,
        [10.5, 10.0, 10.0],
        JSON.stringify({ shots: [10.5] }), // Object instead of array
        1,
        new Date(),
        'published',
      );

      const parseResult = result.tryParseShots();
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        expect(parseResult.error.code).toBe(ErrorCatalog.PARSE.SHOTS_ARRAY_EXPECTED.code);
      }
    });

    it('should return err when array contains non-numbers', () => {
      const result = ResultEntity.reconstructFromJson(
        createResultId(),
        createEventId(),
        createParticipantId(),
        'Test Player',
        'Test Team',
        30.5,
        [10.5, 10.0, 10.0],
        JSON.stringify([10.5, 'invalid', 9.8]),
        1,
        new Date(),
        'published',
      );

      const parseResult = result.tryParseShots();
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        expect(parseResult.error.code).toBe(ErrorCatalog.PARSE.INVALID_NUMBER.code);
        expect(parseResult.error.context?.totalInvalid).toBe(1);
      }
    });
  });

  describe('shots getter (backward compatibility)', () => {
    it('should return shots array for valid data', () => {
      const shots = [10.5, 10.2, 9.8];
      const result = ResultEntity.create(
        createResultId(),
        createEventId(),
        createParticipantId(),
        'Test Player',
        'Test Team',
        30.5,
        [10.5, 10.0, 10.0],
        shots,
        1,
      );

      expect(result.shots.length).toBe(60);
      expect(result.shots[0]).toBe(10.5);
    });

    it('should return empty array for invalid JSON (backward compatible)', () => {
      const result = ResultEntity.reconstructFromJson(
        createResultId(),
        createEventId(),
        createParticipantId(),
        'Test Player',
        'Test Team',
        30.5,
        [10.5, 10.0, 10.0],
        'invalid json',
        1,
        new Date(),
        'published',
      );

      // Should not throw, returns empty array for compatibility
      expect(result.shots).toEqual([]);
    });
  });

  describe('compareTo', () => {
    it('should compare by total score first', () => {
      const result1 = ResultEntity.create(
        createResultId(),
        createEventId(),
        createParticipantId(),
        'Player 1',
        'Team',
        630.5,
        [],
        [],
        1,
      );
      const result2 = ResultEntity.create(
        createResultId(),
        createEventId(),
        createParticipantId(),
        'Player 2',
        'Team',
        620.3,
        [],
        [],
        1,
      );

      // Player 1 has higher score, should be ranked higher (negative comparison)
      expect(result1.compareTo(result2)).toBeLessThan(0);
      expect(result2.compareTo(result1)).toBeGreaterThan(0);
    });
  });
});

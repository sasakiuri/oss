import { describe, it, expect } from 'vitest';
import { buildRoundConfig } from '@/shared/constants/roundConfig';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { BR60S_FINAL } from '@/shared/competitionTypes/definitions/BR60S_FINAL';

describe('roundConfig', () => {
  describe('buildRoundConfig with Final definition', () => {
    describe('participant count validation', () => {
      it('should throw when participantCount is 0', () => {
        expect(() => buildRoundConfig(BR60S_FINAL, 0)).toThrow('Invalid participant count: 0');
      });

      it('should throw when participantCount is 1 (below minParticipants)', () => {
        expect(() => buildRoundConfig(BR60S_FINAL, 1)).toThrow('Invalid participant count: 1');
      });

      it('should succeed when participantCount equals minParticipants (2)', () => {
        const config = buildRoundConfig(BR60S_FINAL, 2);

        expect(config.roundType).toBe('Final');
        expect(config.stages).toBe(BR60S_FINAL.config.stages);
      });

      it('should succeed when participantCount equals maxParticipants (8)', () => {
        const config = buildRoundConfig(BR60S_FINAL, 8);

        expect(config.roundType).toBe('Final');
        expect(config.stages).toBe(BR60S_FINAL.config.stages);
      });

      it('should throw when participantCount exceeds maxParticipants (9)', () => {
        expect(() => buildRoundConfig(BR60S_FINAL, 9)).toThrow('Invalid participant count: 9');
      });

      it('should succeed for a mid-range participantCount (5)', () => {
        const config = buildRoundConfig(BR60S_FINAL, 5);

        expect(config.roundType).toBe('Final');
        expect(config.maxChannels).toBe(BR60S_FINAL.config.maxChannels);
      });
    });

    it('should build elimination schedule for elimination stage', () => {
      const config = buildRoundConfig(BR60S_FINAL, 8);

      expect(config.eliminationStageIndex).toBe(2);
      expect(config.eliminationSchedule).toEqual({ 1: 8, 3: 7, 5: 6, 7: 5, 9: 4, 11: 3, 13: 2 });
    });

    it('delays the first checkpoint when fewer finalists start', () => {
      expect(buildRoundConfig(BR60S_FINAL, 5).eliminationSchedule).toEqual({ 7: 5, 9: 4, 11: 3, 13: 2 });
    });
  });

  describe('buildRoundConfig with Qualification definition', () => {
    it('should build a qualification config from definition', () => {
      const config = buildRoundConfig(BR60S);

      expect(config.roundType).toBe('Qualification');
      expect(config.maxChannels).toBe(BR60S.config.maxChannels);
      expect(config.hasRelay).toBe(BR60S.config.hasRelay);
      expect(config.stages).toBe(BR60S.config.stages);
      expect(config.eliminationSchedule).toEqual({});
    });
  });
});

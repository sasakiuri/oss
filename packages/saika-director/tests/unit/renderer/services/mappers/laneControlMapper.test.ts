import { describe, it, expect } from 'vitest';
import {
  mapResponseToLaneControlDto,
  mapResponseToFinalBoardLaneData,
} from '@/renderer/services/mappers/laneControlMapper';

describe('laneControlMapper', () => {
  describe('mapResponseToLaneControlDto', () => {
    it('flattens player information into playerName and affiliation', () => {
      const raw: Record<string, unknown> = {
        id: 'lane-1',
        channel: 3,
        player: { name: 'Alex Smith', affiliation: 'Tokyo', participantId: 'p-1' },
        phase: 'ACTIVE',
        remainingTime: 120,
        shotNumber: 5,
        lastScore: 10.5,
        lastShotTime: 1000,
        seriesScores: [50, 48],
        totalScore: 98,
        recentShots: [10.5, 10.3],
        unifiedPhase: 'ACTIVE',
        stageIndex: 1,
        roundType: 'Qualification',
        stageName: 'Series 1',
        seriesIndex: 0,
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
        relayNumber: 2,
      };

      const dto = mapResponseToLaneControlDto(raw);

      expect(dto.id).toBe('lane-1');
      expect(dto.channel).toBe(3);
      expect(dto.playerName).toBe('Alex Smith');
      expect(dto.affiliation).toBe('Tokyo');
      expect(dto.participantId).toBe('p-1');
      expect(dto.phase).toBe('ACTIVE');
      expect(dto.remainingTime).toBe(120);
      expect(dto.shotNumber).toBe(5);
      expect(dto.totalScore).toBe(98);
      expect(dto.seriesScores).toEqual([50, 48]);
      expect(dto.recentShots).toEqual([10.5, 10.3]);
      expect(dto.relayNumber).toBe(2);
    });

    it('uses default values when player is null', () => {
      const raw: Record<string, unknown> = {
        id: 'lane-2',
        channel: 1,
        player: null,
        phase: 'IDLE',
        remainingTime: 0,
        shotNumber: 0,
        lastScore: null,
        lastShotTime: null,
        seriesScores: [],
        totalScore: 0,
        recentShots: [],
      };

      const dto = mapResponseToLaneControlDto(raw);

      expect(dto.playerName).toBeNull();
      expect(dto.affiliation).toBeNull();
      expect(dto.participantId).toBeUndefined();
      expect(dto.unifiedPhase).toBe('IDLE');
      expect(dto.relayNumber).toBe(1);
      expect(dto.eliminated).toBe(false);
      expect(dto.eliminationRank).toBeNull();
    });
  });

  describe('mapResponseToFinalBoardLaneData', () => {
    it('splits matchShots into the first 10 stage1Shots and remaining stage2Shots', () => {
      const matchShots = [10, 10, 9.8, 10.1, 10.2, 9.9, 10, 10.3, 9.7, 10.4, 10.5, 9.6];
      const raw: Record<string, unknown> = {
        id: 'lane-f1',
        channel: 2,
        player: { name: 'Jordan Lee', affiliation: 'Osaka' },
        unifiedPhase: 'ACTIVE',
        stageName: '2nd Competition Stage',
        seriesIndex: 0,
        remainingTime: 50,
        matchShots,
        preparationShots: [9.5],
        shootoffShots: [],
        stage1Total: 100.4,
        stage2Total: 20.1,
        totalScore: 120.5,
        eliminated: false,
        eliminationRank: null,
      };

      const data = mapResponseToFinalBoardLaneData(raw);

      expect(data.stage1Shots).toEqual(matchShots.slice(0, 10));
      expect(data.stage2Shots).toEqual(matchShots.slice(10));
      expect(data.playerName).toBe('Jordan Lee');
      expect(data.affiliation).toBe('Osaka');
      expect(data.totalScore).toBe(120.5);
      expect(data.preparationShots).toEqual([9.5]);
      expect(data.shootoffShots).toEqual([]);
    });

    it('uses Unregistered when player is null', () => {
      const raw: Record<string, unknown> = {
        id: 'lane-f2',
        channel: 5,
        player: null,
        matchShots: [],
      };

      const data = mapResponseToFinalBoardLaneData(raw);

      expect(data.playerName).toBe('Unregistered');
      expect(data.affiliation).toBe('');
      expect(data.stage1Shots).toEqual([]);
      expect(data.stage2Shots).toEqual([]);
      expect(data.unifiedPhase).toBe('IDLE');
    });

    it('leaves stage2Shots empty when matchShots has fewer than 10 entries', () => {
      const raw: Record<string, unknown> = {
        id: 'lane-f3',
        channel: 1,
        player: { name: 'Test Athlete', affiliation: 'Test Affiliation' },
        matchShots: [10, 10, 10],
      };

      const data = mapResponseToFinalBoardLaneData(raw);

      expect(data.stage1Shots).toEqual([10, 10, 10]);
      expect(data.stage2Shots).toEqual([]);
    });
  });
});

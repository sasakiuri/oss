import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// --- Mock: Store ---
let mockLanesMap = new Map<string, Record<string, unknown>>();
const mockGetLaneById = vi.fn();

vi.mock('@/renderer/presentation/stores/domain/laneControl.store', () => ({
  useLaneControlStore: (selector: (state: Record<string, unknown>) => unknown) => {
    const mockState = {
      lanes: mockLanesMap,
      getLaneById: mockGetLaneById,
    };
    return selector(mockState);
  },
}));

import { useLaneControlData } from '@/renderer/presentation/hooks/useLaneControlData';

function createSampleDto(id: string, channel: number) {
  return {
    id,
    channel,
    playerName: `Player ${channel}`,
    affiliation: 'Test',
    phase: 'IDLE' as const,
    remainingTime: 0,
    shotNumber: 0,
    lastScore: null,
    lastShotTime: null,
    seriesScores: [],
    totalScore: 0,
    recentShots: [],
    unifiedPhase: 'IDLE',
    stageIndex: 0,
    roundType: 'Qualification' as const,
    stageName: '',
    seriesIndex: 0,
    stage1Total: 0,
    stage2Total: 0,
    eliminated: false,
    eliminationRank: null,
    relayNumber: 1,
  };
}

describe('useLaneControlData', () => {
  it('returns lanesMap', () => {
    const dto1 = createSampleDto('lane-1', 1);
    const dto2 = createSampleDto('lane-2', 2);
    mockLanesMap = new Map([
      ['lane-1', dto1],
      ['lane-2', dto2],
    ]);

    const { result } = renderHook(() => useLaneControlData());

    expect(result.current.lanesMap).toBe(mockLanesMap);
  });

  it('returns lanes as an array from Map.values()', () => {
    const dto1 = createSampleDto('lane-1', 1);
    const dto2 = createSampleDto('lane-2', 2);
    mockLanesMap = new Map([
      ['lane-1', dto1],
      ['lane-2', dto2],
    ]);

    const { result } = renderHook(() => useLaneControlData());

    expect(result.current.lanes).toEqual([dto1, dto2]);
    expect(result.current.lanes).toHaveLength(2);
  });

  it('returns getLaneById', () => {
    mockLanesMap = new Map();

    const { result } = renderHook(() => useLaneControlData());

    expect(result.current.getLaneById).toBe(mockGetLaneById);
  });

  it('returns an empty array for an empty Map', () => {
    mockLanesMap = new Map();

    const { result } = renderHook(() => useLaneControlData());

    expect(result.current.lanes).toEqual([]);
    expect(result.current.lanes).toHaveLength(0);
  });
});

import { create } from 'zustand';
import type { LanePhase } from '@/shared/constants/competition';
import { Logger } from '@/shared/utils/Logger';
import { createMapFromArray, setInMap, patchInMap, mapToArray, type PatchResult, createPatchResult } from '../utils';

const logger = Logger.create('LaneControlStore');

export interface LaneControlDto {
  id: string;
  channel: number;
  playerName: string | null;
  affiliation: string | null;
  participantId?: string;
  phase: LanePhase;
  remainingTime: number;
  shotNumber: number;
  lastScore: number | null;
  lastShotTime: number | null;
  seriesScores: number[];
  totalScore: number;
  recentShots: number[];
  unifiedPhase: string;
  stageIndex: number;
  seriesIndex: number;
  roundType: string;
  stageName: string;
  stage1Total: number;
  stage2Total: number;
  eliminated: boolean;
  eliminationRank: number | null;
  relayNumber: number;
}

interface LaneControlState {
  lanes: Map<string, LaneControlDto>;

  // Actions
  setLanes: (lanes: LaneControlDto[]) => void;
  updateLane: (lane: LaneControlDto) => void;
  patchLane: (laneId: string, patch: Partial<LaneControlDto>) => PatchResult;
  updateLaneTimer: (laneId: string, remainingTime: number, phase: LanePhase) => PatchResult;
  clearLanes: () => void;
  reset: () => void;

  // Selectors
  getLaneById: (id: string) => LaneControlDto | undefined;
  getLanesArray: () => LaneControlDto[];
}

export const useLaneControlStore = create<LaneControlState>((set, get) => ({
  lanes: new Map(),

  setLanes: (lanes) => {
    const newMap = createMapFromArray(lanes);
    set({ lanes: newMap });
  },

  updateLane: (lane) =>
    set((state) => ({
      lanes: setInMap(state.lanes, lane.id, lane),
    })),

  patchLane: (laneId, patch) => {
    const result = patchInMap(get().lanes, laneId, patch);
    if (!result.success) {
      logger.warn(`patchLane: Lane not found, full sync required`, { laneId });
      return createPatchResult(false, true);
    }
    set({ lanes: result.map });
    return createPatchResult(true);
  },

  updateLaneTimer: (laneId, remainingTime, phase) => {
    const result = patchInMap(get().lanes, laneId, { remainingTime, phase });
    if (!result.success) {
      logger.warn(`updateLaneTimer: Lane not found, full sync required`, { laneId });
      return createPatchResult(false, true);
    }
    set({ lanes: result.map });
    return createPatchResult(true);
  },

  clearLanes: () => {
    set({ lanes: new Map() });
  },

  reset: () => {
    set({ lanes: new Map() });
  },

  // Selectors
  getLaneById: (id) => get().lanes.get(id),

  getLanesArray: () => mapToArray(get().lanes),
}));

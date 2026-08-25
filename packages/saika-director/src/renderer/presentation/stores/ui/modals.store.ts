import { create } from 'zustand';
import type { ShotDto } from '@/shared/ipc/contracts/laneControl.contract';

// ─── Shot Edit Modal ───────────────────────────────────

export interface ShotEditModalState {
  isOpen: boolean;
  laneId: string | null;
  laneName: string | null;
  channel: number | null;
  activePhase: 'PREPARATION' | 'MATCH';
  preparationShots: ShotDto[];
  matchShots: ShotDto[];
  totalScore: number;
  seriesScores: number[];
  loading: boolean;
  error: string | null;
}

interface ShotEditActions {
  openModal: (laneId: string, laneName: string, channel: number) => void;
  closeModal: () => void;
  setActivePhase: (phase: 'PREPARATION' | 'MATCH') => void;
  setShots: (preparationShots: ShotDto[], matchShots: ShotDto[], totalScore: number, seriesScores: number[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

type ShotEditStore = ShotEditModalState & ShotEditActions;

const initialShotEditState: ShotEditModalState = {
  isOpen: false,
  laneId: null,
  laneName: null,
  channel: null,
  activePhase: 'MATCH',
  preparationShots: [],
  matchShots: [],
  totalScore: 0,
  seriesScores: [],
  loading: false,
  error: null,
};

export const useShotEditStore = create<ShotEditStore>((set) => ({
  ...initialShotEditState,
  openModal: (laneId, laneName, channel) =>
    set({
      isOpen: true,
      laneId,
      laneName,
      channel,
      activePhase: 'MATCH',
      preparationShots: [],
      matchShots: [],
      totalScore: 0,
      seriesScores: [],
      loading: false,
      error: null,
    }),
  closeModal: () => set({ ...initialShotEditState }),
  setActivePhase: (phase) => set({ activePhase: phase }),
  setShots: (preparationShots, matchShots, totalScore, seriesScores) =>
    set({ preparationShots, matchShots, totalScore, seriesScores }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));

// ─── Lane Move Modal ───────────────────────────────────

export interface LaneMoveModalState {
  isOpen: boolean;
  sourceLaneId: string | null;
  sourceLaneName: string | null;
  sourceChannel: number | null;
  selectedTargetLaneId: string | null;
  loading: boolean;
  error: string | null;
}

interface LaneMoveActions {
  openModal: (sourceLaneId: string, sourceLaneName: string, sourceChannel: number) => void;
  closeModal: () => void;
  setSelectedTargetLaneId: (laneId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

type LaneMoveStore = LaneMoveModalState & LaneMoveActions;

const initialLaneMoveState: LaneMoveModalState = {
  isOpen: false,
  sourceLaneId: null,
  sourceLaneName: null,
  sourceChannel: null,
  selectedTargetLaneId: null,
  loading: false,
  error: null,
};

export const useLaneMoveStore = create<LaneMoveStore>((set) => ({
  ...initialLaneMoveState,
  openModal: (sourceLaneId, sourceLaneName, sourceChannel) =>
    set({
      isOpen: true,
      sourceLaneId,
      sourceLaneName,
      sourceChannel,
      selectedTargetLaneId: null,
      loading: false,
      error: null,
    }),
  closeModal: () => set({ ...initialLaneMoveState }),
  setSelectedTargetLaneId: (laneId) => set({ selectedTargetLaneId: laneId }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));

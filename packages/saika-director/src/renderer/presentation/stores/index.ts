// Domain stores (server-synced data)
export { useLaneControlStore, useChampionshipStore, useShootoffStore, useCompetitionControlStore } from './domain';
export type { LaneControlDto, ActiveShootoff, ShootoffRoundData, ChampionshipResultContext } from './domain';

// System stores (real-time system state)
export { useConnectionStore, useTimerStore, useDebugStore } from './system';
export type { DebugTab } from './system';

// UI stores (local UI state)
export { useNavigationStore, useSelectionStore, useShotEditStore, useLaneMoveStore } from './ui';
export type { ActiveScreen, ShotEditModalState, LaneMoveModalState } from './ui';

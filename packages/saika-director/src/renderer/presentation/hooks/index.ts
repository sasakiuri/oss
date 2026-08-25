// --- Hooks (flat structure) ---

// Data hooks - Pure selectors (no side effects)
export { useLaneControlData } from './useLaneControlData';
export { useTimer } from './useTimer';
export { useResults } from './useResults';
export { useDebugLog } from './useDebugLog';

// Action hooks - Service call wrappers
export { useLaneControlActions } from './useLaneControlActions';
export { useChampionshipActions } from './useChampionshipActions';
export { useLaneMove } from './useLaneMove';
export { usePrint } from './usePrint';
export type { PrintContext } from './usePrint';

// UI hooks - UI state management
export { useSelection } from './useSelection';
export { useGridDragDrop } from './useGridDragDrop';
export { useIMEInput } from './useIMEInput';
export { useShotEditForm } from './useShotEditForm';

// Event hooks - IPC event subscription
export { useEvent } from './useEvent';
export { useLaneControlEvents } from './useLaneControlEvents';
export { useSystemEvents } from './useSystemEvents';

// Composed hooks - Screen-level composed hooks
export { useLaneControl } from './useLaneControl';
export { useBoardLaneData } from './useBoardLaneData';
export type { UseBoardLaneDataOptions, UseBoardLaneDataResult } from './useBoardLaneData';

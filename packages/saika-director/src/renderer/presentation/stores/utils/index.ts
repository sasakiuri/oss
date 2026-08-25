// Map operations
export { createMapFromArray, setInMap, patchInMap, deleteFromMap, clearMap, mapToArray } from './mapHelpers';

// Selection operations
export { toggleInSet, selectAllFromMap, clearSelection } from './mapHelpers';

// Array operations
export { addWithLimit, addManyWithLimit } from './mapHelpers';

// Patch result
export type { PatchResult } from './mapHelpers';
export { createPatchResult } from './mapHelpers';

// Entity store factory
export type {
  EntityWithId,
  EntityStoreState,
  SelectionActions,
  EntityCrudActions,
  EntityStoreActions,
} from './createEntityStore';
export { createSelectionActions, createEntityCrudActions, createInitialEntityState } from './createEntityStore';

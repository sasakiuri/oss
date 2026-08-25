import {
  createMapFromArray,
  setInMap,
  patchInMap,
  mapToArray,
  toggleInSet,
  selectAllFromMap,
  clearSelection,
  type PatchResult,
  createPatchResult,
} from './mapHelpers';

export interface EntityWithId {
  id: string;
}

export interface EntityStoreState<T extends EntityWithId> {
  entities: Map<string, T>;
  selectedIds: Set<string>;
}

export interface SelectionActions {
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  isSelected: (id: string) => boolean;
}

export interface EntityCrudActions<T extends EntityWithId> {
  setEntities: (entities: T[]) => void;
  setEntity: (entity: T) => void;
  updateEntity: (id: string, patch: Partial<T>) => PatchResult;
  removeEntity: (id: string) => void;
  clearEntities: () => void;
  getEntity: (id: string) => T | undefined;
  getEntitiesArray: () => T[];
}

export type EntityStoreActions<T extends EntityWithId> = SelectionActions & EntityCrudActions<T>;

type SetState<State> = (partial: State | Partial<State> | ((state: State) => State | Partial<State>)) => void;

type GetState<State> = () => State;

export function createSelectionActions<T extends EntityWithId>(
  set: SetState<EntityStoreState<T>>,
  get: GetState<EntityStoreState<T>>,
  entityKey: 'entities' = 'entities',
): SelectionActions {
  return {
    toggleSelect: (id: string) => {
      set((state) => ({
        selectedIds: toggleInSet(state.selectedIds, id),
      }));
    },

    selectAll: () => {
      set((state) => ({
        selectedIds: selectAllFromMap(state[entityKey] as Map<string, T>),
      }));
    },

    deselectAll: () => {
      set({ selectedIds: clearSelection() });
    },

    isSelected: (id: string) => {
      return get().selectedIds.has(id);
    },
  };
}

export function createEntityCrudActions<T extends EntityWithId>(
  set: SetState<EntityStoreState<T>>,
  get: GetState<EntityStoreState<T>>,
  entityKey: 'entities' = 'entities',
): EntityCrudActions<T> {
  return {
    setEntities: (entities: T[]) => {
      set({ [entityKey]: createMapFromArray(entities) } as Partial<EntityStoreState<T>>);
    },

    setEntity: (entity: T) => {
      set((state) => ({
        [entityKey]: setInMap(state[entityKey] as Map<string, T>, entity.id, entity),
      }));
    },

    updateEntity: (id: string, patch: Partial<T>): PatchResult => {
      const state = get();
      const map = state[entityKey] as Map<string, T>;
      const result = patchInMap(map, id, patch);

      if (!result.success) {
        return createPatchResult(false, true);
      }

      set({ [entityKey]: result.map } as Partial<EntityStoreState<T>>);
      return createPatchResult(true);
    },

    removeEntity: (id: string) => {
      set((state) => {
        const newMap = new Map(state[entityKey] as Map<string, T>);
        newMap.delete(id);
        const newSelectedIds = new Set(state.selectedIds);
        newSelectedIds.delete(id);
        return {
          [entityKey]: newMap,
          selectedIds: newSelectedIds,
        } as Partial<EntityStoreState<T>>;
      });
    },

    clearEntities: () => {
      set({
        [entityKey]: new Map(),
        selectedIds: new Set(),
      } as Partial<EntityStoreState<T>>);
    },

    getEntity: (id: string) => {
      return (get()[entityKey] as Map<string, T>).get(id);
    },

    getEntitiesArray: () => {
      return mapToArray(get()[entityKey] as Map<string, T>);
    },
  };
}

export function createInitialEntityState<T extends EntityWithId>(): EntityStoreState<T> {
  return {
    entities: new Map(),
    selectedIds: new Set(),
  };
}

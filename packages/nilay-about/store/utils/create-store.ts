import { create, type StateCreator, type StoreApi } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { persist, type PersistOptions } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

/**
 * Store creation utilities for consistent patterns
 */

// Type for separating state from actions
type StateSlice<T> = T extends { [K in keyof T]: T[K] extends Function ? never : T[K] }
  ? T
  : never;

/**
 * Create a store with immer middleware for immutable updates
 */
export function createImmerStore<T extends object>(
  initializer: StateCreator<T, [["zustand/immer", never]], []>
) {
  return create(immer(initializer));
}

/**
 * Create a store with persistence
 */
export function createPersistedStore<T extends object>(
  initializer: StateCreator<T, [["zustand/persist", unknown]], []>,
  persistOptions: PersistOptions<T>
) {
  return create(persist(initializer, persistOptions));
}

/**
 * Create a store with both immer and persistence
 */
export function createPersistedImmerStore<T extends object>(
  initializer: StateCreator<T, [["zustand/immer", never], ["zustand/persist", unknown]], []>,
  persistOptions: PersistOptions<T>
) {
  return create(persist(immer(initializer), persistOptions));
}

/**
 * Create a selector hook that only re-renders when selected values change
 */
export function createSelector<Store, Selected>(
  useStore: () => Store,
  selector: (state: Store) => Selected
) {
  return () => useStore()(selector);
}

/**
 * Create a shallow selector hook for object selections
 */
export function createShallowSelector<Store extends object, Selected extends object>(
  useStore: (selector: (state: Store) => Selected) => Selected,
  selector: (state: Store) => Selected
) {
  return () => useStore(useShallow(selector));
}

/**
 * Create actions-only selector (stable reference)
 */
export function createActionsSelector<Store extends object, Actions extends object>(
  useStore: (selector: (state: Store) => Actions) => Actions,
  actionKeys: (keyof Actions)[]
) {
  return () =>
    useStore(
      useShallow((state) => {
        const actions: Partial<Actions> = {};
        for (const key of actionKeys) {
          actions[key] = state[key as keyof Store] as Actions[typeof key];
        }
        return actions as Actions;
      })
    );
}

/**
 * Store reset utility for testing
 */
export function createStoreResetter<T extends object>(
  useStore: StoreApi<T>,
  initialState: Partial<T>
) {
  return () => {
    useStore.setState(initialState as T, true);
  };
}

/**
 * Devtools wrapper for development
 */
export function withDevtools<T extends object>(
  store: StateCreator<T>,
  name: string
): StateCreator<T> {
  if (process.env.NODE_ENV === "development") {
    // Could add devtools middleware here
    return store;
  }
  return store;
}

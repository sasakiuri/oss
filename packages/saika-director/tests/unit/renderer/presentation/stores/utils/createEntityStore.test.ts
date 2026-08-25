import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import {
  createSelectionActions,
  createEntityCrudActions,
  createInitialEntityState,
  type EntityWithId,
  type EntityStoreState,
  type EntityStoreActions,
} from '@/renderer/presentation/stores/utils/createEntityStore';

interface TestEntity extends EntityWithId {
  id: string;
  name: string;
  value: number;
}

type TestStoreState = EntityStoreState<TestEntity> & EntityStoreActions<TestEntity>;

function createTestStore() {
  return create<TestStoreState>((set, get) => ({
    ...createInitialEntityState<TestEntity>(),
    ...createSelectionActions<TestEntity>(set, get),
    ...createEntityCrudActions<TestEntity>(set, get),
  }));
}

function createEntity(overrides: Partial<TestEntity> = {}): TestEntity {
  return {
    id: 'entity-1',
    name: 'Test Entity',
    value: 100,
    ...overrides,
  };
}

describe('createEntityStore', () => {
  let useStore: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    useStore = createTestStore();
  });

  describe('initial state', () => {
    it('should have empty entities map', () => {
      expect(useStore.getState().entities).toBeInstanceOf(Map);
      expect(useStore.getState().entities.size).toBe(0);
    });

    it('should have empty selectedIds set', () => {
      expect(useStore.getState().selectedIds).toBeInstanceOf(Set);
      expect(useStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe('setEntities', () => {
    it('should set entities from array', () => {
      useStore.getState().setEntities([createEntity({ id: 'e1', name: 'A' }), createEntity({ id: 'e2', name: 'B' })]);

      expect(useStore.getState().entities.size).toBe(2);
      expect(useStore.getState().entities.get('e1')?.name).toBe('A');
    });

    it('should replace existing entities', () => {
      useStore.getState().setEntities([createEntity({ id: 'old' })]);
      useStore.getState().setEntities([createEntity({ id: 'new' })]);

      expect(useStore.getState().entities.size).toBe(1);
      expect(useStore.getState().entities.has('new')).toBe(true);
    });
  });

  describe('setEntity', () => {
    it('should add new entity', () => {
      useStore.getState().setEntity(createEntity({ id: 'e1' }));

      expect(useStore.getState().entities.size).toBe(1);
      expect(useStore.getState().entities.get('e1')?.id).toBe('e1');
    });

    it('should replace existing entity', () => {
      useStore.getState().setEntity(createEntity({ id: 'e1', value: 100 }));
      useStore.getState().setEntity(createEntity({ id: 'e1', value: 200 }));

      expect(useStore.getState().entities.get('e1')?.value).toBe(200);
    });
  });

  describe('updateEntity', () => {
    it('should patch existing entity', () => {
      useStore.getState().setEntity(createEntity({ id: 'e1', value: 100, name: 'Original' }));

      const result = useStore.getState().updateEntity('e1', { value: 200 });

      expect(result.applied).toBe(true);
      expect(result.needsFullSync).toBe(false);
      expect(useStore.getState().entities.get('e1')?.value).toBe(200);
      expect(useStore.getState().entities.get('e1')?.name).toBe('Original');
    });

    it('should return failure for non-existent entity', () => {
      const result = useStore.getState().updateEntity('missing', { value: 100 });

      expect(result.applied).toBe(false);
      expect(result.needsFullSync).toBe(true);
    });
  });

  describe('removeEntity', () => {
    it('should remove entity by id', () => {
      useStore.getState().setEntities([createEntity({ id: 'e1' }), createEntity({ id: 'e2' })]);

      useStore.getState().removeEntity('e1');

      expect(useStore.getState().entities.size).toBe(1);
      expect(useStore.getState().entities.has('e1')).toBe(false);
    });

    it('should also remove from selectedIds', () => {
      useStore.getState().setEntity(createEntity({ id: 'e1' }));
      useStore.getState().toggleSelect('e1');

      useStore.getState().removeEntity('e1');

      expect(useStore.getState().selectedIds.has('e1')).toBe(false);
    });

    it('should handle removing non-existent entity', () => {
      useStore.getState().setEntity(createEntity({ id: 'e1' }));

      useStore.getState().removeEntity('non-existent');

      expect(useStore.getState().entities.size).toBe(1);
    });
  });

  describe('clearEntities', () => {
    it('should clear all entities and selections', () => {
      useStore.getState().setEntities([createEntity({ id: 'e1' }), createEntity({ id: 'e2' })]);
      useStore.getState().toggleSelect('e1');

      useStore.getState().clearEntities();

      expect(useStore.getState().entities.size).toBe(0);
      expect(useStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe('getEntity', () => {
    it('should return entity by id', () => {
      useStore.getState().setEntity(createEntity({ id: 'e1', name: 'Found' }));

      expect(useStore.getState().getEntity('e1')?.name).toBe('Found');
    });

    it('should return undefined for missing entity', () => {
      expect(useStore.getState().getEntity('missing')).toBeUndefined();
    });
  });

  describe('getEntitiesArray', () => {
    it('should return entities as array', () => {
      useStore.getState().setEntities([createEntity({ id: 'e1' }), createEntity({ id: 'e2' })]);

      const array = useStore.getState().getEntitiesArray();
      expect(array).toHaveLength(2);
    });

    it('should return empty array when no entities', () => {
      expect(useStore.getState().getEntitiesArray()).toHaveLength(0);
    });
  });

  describe('toggleSelect', () => {
    it('should add id to selection', () => {
      useStore.getState().toggleSelect('e1');
      expect(useStore.getState().selectedIds.has('e1')).toBe(true);
    });

    it('should remove id from selection on second toggle', () => {
      useStore.getState().toggleSelect('e1');
      useStore.getState().toggleSelect('e1');
      expect(useStore.getState().selectedIds.has('e1')).toBe(false);
    });
  });

  describe('selectAll', () => {
    it('should select all entity ids', () => {
      useStore.getState().setEntities([createEntity({ id: 'e1' }), createEntity({ id: 'e2' })]);

      useStore.getState().selectAll();

      expect(useStore.getState().selectedIds.size).toBe(2);
      expect(useStore.getState().selectedIds.has('e1')).toBe(true);
      expect(useStore.getState().selectedIds.has('e2')).toBe(true);
    });
  });

  describe('deselectAll', () => {
    it('should clear all selections', () => {
      useStore.getState().toggleSelect('e1');
      useStore.getState().toggleSelect('e2');

      useStore.getState().deselectAll();

      expect(useStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe('isSelected', () => {
    it('should return true for selected entity', () => {
      useStore.getState().toggleSelect('e1');
      expect(useStore.getState().isSelected('e1')).toBe(true);
    });

    it('should return false for non-selected entity', () => {
      expect(useStore.getState().isSelected('e1')).toBe(false);
    });
  });
});

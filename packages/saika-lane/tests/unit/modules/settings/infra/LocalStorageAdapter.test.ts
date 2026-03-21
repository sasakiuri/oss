// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalStorageAdapter } from '@/main/modules/settings/infra/LocalStorageAdapter';
import { DomainError } from '@/shared/errors/DomainError';

// Mock electron-store
vi.mock('electron-store', () => {
  return {
    default: vi.fn(),
  };
});

// Mock getLogger
vi.mock('@/main/shared-infra/logging', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;
  let mockStore: any;

  beforeEach(async () => {
    // Initialize mock store
    mockStore = {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      delete: vi.fn(),
      store: {},
      clear: vi.fn(),
    };

    // electron-store constructor mock
    const Store = (await import('electron-store')).default;
    vi.mocked(Store).mockImplementation(() => mockStore);

    adapter = new LocalStorageAdapter({ name: 'test-store' });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('get()', () => {
    it('should return the value when the key exists', () => {
      mockStore.get.mockReturnValue('test-value');
      const result = adapter.get('test-key');
      expect(result).toBe('test-value');
      expect(mockStore.get).toHaveBeenCalledWith('test-key');
    });

    it('should return undefined when the key does not exist', () => {
      mockStore.get.mockReturnValue(undefined);
      const result = adapter.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should throw STORAGE_READ_ERROR when a read error occurs', () => {
      mockStore.get.mockImplementation(() => {
        throw new Error('Read failed');
      });

      try {
        adapter.get('test-key');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('STORAGE_READ_ERROR');
        expect((error as DomainError).message).toContain('Failed to read from storage');
      }
    });
  });

  describe('set()', () => {
    it('should set a value successfully', () => {
      adapter.set('test-key', 'test-value');
      expect(mockStore.set).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('should set an object', () => {
      const obj = { name: 'test', value: 123 };
      adapter.set('obj-key', obj);
      expect(mockStore.set).toHaveBeenCalledWith('obj-key', obj);
    });

    it('should throw STORAGE_WRITE_ERROR when a write error occurs', () => {
      mockStore.set.mockImplementation(() => {
        throw new Error('Write failed');
      });

      try {
        adapter.set('test-key', 'value');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('STORAGE_WRITE_ERROR');
        expect((error as DomainError).message).toContain('Failed to write to storage');
      }
    });
  });

  describe('setMany()', () => {
    it('should set multiple values at once', () => {
      adapter.setMany({ key1: 'value1', key2: 'value2' });
      expect(mockStore.set).toHaveBeenCalledWith({ key1: 'value1', key2: 'value2' });
    });

    it('should call electron-store set() only once', () => {
      adapter.setMany({ a: 1, b: 2, c: 3 });
      expect(mockStore.set).toHaveBeenCalledTimes(1);
    });

    it('should throw STORAGE_WRITE_ERROR when a write error occurs', () => {
      mockStore.set.mockImplementation(() => {
        throw new Error('Batch write failed');
      });

      try {
        adapter.setMany({ key1: 'value1' });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('STORAGE_WRITE_ERROR');
        expect((error as DomainError).message).toContain('Failed to write to storage');
      }
    });
  });

  describe('has()', () => {
    it('should return true when the key exists', () => {
      mockStore.has.mockReturnValue(true);
      expect(adapter.has('test-key')).toBe(true);
    });

    it('should return false when the key does not exist', () => {
      mockStore.has.mockReturnValue(false);
      expect(adapter.has('non-existent')).toBe(false);
    });
  });

  describe('delete()', () => {
    it('should delete a key successfully', () => {
      adapter.delete('test-key');
      expect(mockStore.delete).toHaveBeenCalledWith('test-key');
    });

    it('should throw STORAGE_DELETE_ERROR when a delete error occurs', () => {
      mockStore.delete.mockImplementation(() => {
        throw new Error('Delete failed');
      });

      try {
        adapter.delete('test-key');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('STORAGE_DELETE_ERROR');
        expect((error as DomainError).message).toContain('Failed to delete from storage');
      }
    });
  });

  describe('getAll()', () => {
    it('should retrieve all data', () => {
      const data = { key1: 'value1', key2: 'value2' };
      mockStore.store = data;
      expect(adapter.getAll()).toEqual(data);
    });

    it('should throw STORAGE_READ_ERROR when a read error occurs', () => {
      Object.defineProperty(mockStore, 'store', {
        get: () => {
          throw new Error('Read all failed');
        },
      });

      try {
        adapter.getAll();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('STORAGE_READ_ERROR');
      }
    });
  });

  describe('clear()', () => {
    it('should clear all data', () => {
      adapter.clear();
      expect(mockStore.clear).toHaveBeenCalled();
    });

    it('should throw STORAGE_DELETE_ERROR when a clear error occurs', () => {
      mockStore.clear.mockImplementation(() => {
        throw new Error('Clear failed');
      });

      try {
        adapter.clear();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('STORAGE_DELETE_ERROR');
        expect((error as DomainError).message).toContain('Failed to delete from storage');
      }
    });
  });

  describe('Immutability', () => {
    it('should have a frozen instance', () => {
      expect(Object.isFrozen(adapter)).toBe(true);
    });
  });
});

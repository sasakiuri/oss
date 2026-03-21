// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { settingsModule } from '@/main/modules/settings/settings.module';
import { settingsContract } from '@/shared/ipc/contracts';
import type { InferHandlers } from '@/shared/ipc/defineContract';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CapturedHandlers = InferHandlers<typeof settingsContract>;

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockStorage(): ILocalStorage {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => store.get(key) ?? undefined) as ILocalStorage['get'],
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
    }),
    setMany: vi.fn((entries: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(entries)) {
        store.set(key, value);
      }
    }),
    has: vi.fn((key: string) => store.has(key)),
    delete: vi.fn((key: string) => {
      store.delete(key);
    }),
    getAll: vi.fn(() => Object.fromEntries(store)),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
}

function createMockIpcRouter() {
  let capturedHandlers: CapturedHandlers | null = null;
  return {
    register: vi.fn((_contract: unknown, handlers: CapturedHandlers) => {
      capturedHandlers = handlers;
    }),
    getHandlers: () => capturedHandlers!,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('settings module handlers', () => {
  let storage: ILocalStorage;
  let handlers: CapturedHandlers;

  beforeEach(() => {
    storage = createMockStorage();
    const ipcRouter = createMockIpcRouter();

    settingsModule.register({
      ipcRouter: ipcRouter as unknown as Parameters<typeof settingsModule.register>[0]['ipcRouter'],
      storage,
    });

    handlers = ipcRouter.getHandlers();
  });

  // -----------------------------------------------------------------------
  // UserPreferences round-trip (Lane Number persistence)
  // -----------------------------------------------------------------------

  describe('UserPreferences round-trip (Lane Number persistence)', () => {
    it('should restore saved laneNumber via getUserPreferences', async () => {
      await handlers.saveUserPreferences({ preferences: { laneNumber: 3 } });

      const result = await handlers.getUserPreferences();

      expect(result).toEqual({ laneNumber: 3 });
    });

    it('should save and restore laneNumber and discipline simultaneously', async () => {
      await handlers.saveUserPreferences({
        preferences: { laneNumber: 5, discipline: 'AIR_RIFLE_10M' },
      });

      const result = await handlers.getUserPreferences();

      expect(result).toEqual({ laneNumber: 5, discipline: 'AIR_RIFLE_10M' });
    });

    it('should restore the latest value when laneNumber is overwritten', async () => {
      await handlers.saveUserPreferences({ preferences: { laneNumber: 1 } });
      await handlers.saveUserPreferences({ preferences: { laneNumber: 7 } });

      const result = await handlers.getUserPreferences();

      expect(result).toEqual({ laneNumber: 7 });
    });

    it('should return an empty object when nothing is saved', async () => {
      const result = await handlers.getUserPreferences();

      expect(result).toEqual({});
    });

    it('should not include discipline when only laneNumber is saved', async () => {
      await handlers.saveUserPreferences({ preferences: { laneNumber: 2 } });

      const result = await handlers.getUserPreferences();

      expect(result).toEqual({ laneNumber: 2 });
      expect(result).not.toHaveProperty('discipline');
    });
  });

  // -----------------------------------------------------------------------
  // ConnectionSettings round-trip
  // -----------------------------------------------------------------------

  describe('ConnectionSettings round-trip', () => {
    it('should restore saved connectionSettings', async () => {
      const settings = {
        portName: 'COM3',
        manufacturer: 'KOHTO' as const,
        deviceId: 'MT201-001',
      };

      await handlers.saveConnectionSettings({ settings });

      const result = await handlers.getConnectionSettings();

      expect(result).toEqual(settings);
    });

    it('should throw SETTINGS_NOT_FOUND error when nothing is saved', async () => {
      await expect(handlers.getConnectionSettings()).rejects.toMatchObject({
        code: 'SETTINGS_NOT_FOUND',
      });
    });
  });

  // -----------------------------------------------------------------------
  // UserPreferences incremental save consistency
  // -----------------------------------------------------------------------

  describe('UserPreferences incremental save consistency', () => {
    it('should not lose discipline when saving laneNumber after saving discipline', async () => {
      // Target tab discipline selection (save discipline only)
      await handlers.saveUserPreferences({ preferences: { discipline: 'AIR_RIFLE_10M' } });

      // General tab Save (save laneNumber only)
      await handlers.saveUserPreferences({ preferences: { laneNumber: 5 } });

      // Read on restart
      const prefs = await handlers.getUserPreferences();
      expect(prefs).toEqual({ discipline: 'AIR_RIFLE_10M', laneNumber: 5 });
    });

    it('should not lose laneNumber when saving discipline after saving laneNumber', async () => {
      // General tab Save (save laneNumber only)
      await handlers.saveUserPreferences({ preferences: { laneNumber: 3 } });

      // Target tab discipline selection (save discipline only)
      await handlers.saveUserPreferences({ preferences: { discipline: 'AIR_PISTOL_10M' } });

      // Read on restart
      const prefs = await handlers.getUserPreferences();
      expect(prefs).toEqual({ laneNumber: 3, discipline: 'AIR_PISTOL_10M' });
    });
  });

  // -----------------------------------------------------------------------
  // UserPreferences edge cases (Codex review feedback)
  // -----------------------------------------------------------------------

  describe('UserPreferences edge cases (Codex review feedback)', () => {
    it('should not erase existing values when preferences contain explicit undefined', async () => {
      // discipline already saved
      await handlers.saveUserPreferences({ preferences: { discipline: 'AIR_RIFLE_10M' } });

      // Save laneNumber while discipline: undefined is mixed in
      await handlers.saveUserPreferences({
        preferences: { laneNumber: 5, discipline: undefined },
      });

      const prefs = await handlers.getUserPreferences();
      // discipline should not be overwritten by undefined, original value should be retained
      expect(prefs).toEqual({ discipline: 'AIR_RIFLE_10M', laneNumber: 5 });
    });

    it('should not change existing values when saving with empty object {}', async () => {
      await handlers.saveUserPreferences({ preferences: { laneNumber: 7, discipline: 'AIR_PISTOL_10M' } });

      // Save with empty object (expected no-op)
      await handlers.saveUserPreferences({ preferences: {} });

      const prefs = await handlers.getUserPreferences();
      expect(prefs).toEqual({ laneNumber: 7, discipline: 'AIR_PISTOL_10M' });
    });

    it('should merge new values when existing value is an empty object', async () => {
      // Explicitly save empty object (simulating initial state)
      await handlers.saveUserPreferences({ preferences: {} });

      await handlers.saveUserPreferences({ preferences: { laneNumber: 2 } });

      const prefs = await handlers.getUserPreferences();
      expect(prefs).toEqual({ laneNumber: 2 });
    });

    it('should reflect the latest value when overwriting the same discipline key', async () => {
      await handlers.saveUserPreferences({ preferences: { discipline: 'AIR_RIFLE_10M' } });
      await handlers.saveUserPreferences({ preferences: { discipline: 'AIR_PISTOL_10M' } });

      const prefs = await handlers.getUserPreferences();
      expect(prefs).toEqual({ discipline: 'AIR_PISTOL_10M' });
    });
  });
});

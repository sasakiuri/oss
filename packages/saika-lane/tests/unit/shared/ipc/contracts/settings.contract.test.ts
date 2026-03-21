// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { settingsContract } from '@/shared/ipc/contracts/settings.contract';

describe('settingsContract', () => {
  it('has 2 commands and 2 queries', () => {
    const procs = settingsContract.procedures;
    const commands = Object.values(procs).filter((p) => p.kind === 'command');
    const queries = Object.values(procs).filter((p) => p.kind === 'query');

    expect(commands).toHaveLength(2);
    expect(queries).toHaveLength(2);
  });

  it('has the expected channel names configured', () => {
    expect(settingsContract.channels.saveConnectionSettings).toBe('settings:save-connection-settings');
    expect(settingsContract.channels.getConnectionSettings).toBe('settings:get-connection-settings');
    expect(settingsContract.channels.saveUserPreferences).toBe('settings:save-user-preferences');
    expect(settingsContract.channels.getUserPreferences).toBe('settings:get-user-preferences');
  });

  it('saveConnectionSettings input schema accepts valid data', () => {
    const schema = settingsContract.procedures.saveConnectionSettings.input;
    const result = schema.safeParse({
      settings: {
        portName: 'COM1',
        manufacturer: 'KOHTO',
      },
    });
    expect(result.success).toBe(true);
  });

  it('saveConnectionSettings input schema accepts optional fields', () => {
    const schema = settingsContract.procedures.saveConnectionSettings.input;
    const result = schema.safeParse({
      settings: {
        portName: 'COM1',
        manufacturer: 'DISAG',
        deviceId: 'dev-1',
      },
    });
    expect(result.success).toBe(true);
  });

  describe('UserPreferences audioVolume boundary values', () => {
    const schema = settingsContract.procedures.saveUserPreferences.input;

    it('audioVolume: 0 is valid', () => {
      const result = schema.safeParse({ preferences: { audioVolume: 0 } });
      expect(result.success).toBe(true);
    });

    it('audioVolume: 100 is valid', () => {
      const result = schema.safeParse({ preferences: { audioVolume: 100 } });
      expect(result.success).toBe(true);
    });

    it('audioVolume: -1 is invalid', () => {
      const result = schema.safeParse({ preferences: { audioVolume: -1 } });
      expect(result.success).toBe(false);
    });

    it('audioVolume: 101 is invalid', () => {
      const result = schema.safeParse({ preferences: { audioVolume: 101 } });
      expect(result.success).toBe(false);
    });

    it('audioVolume: 50.5 is invalid (integers only)', () => {
      const result = schema.safeParse({ preferences: { audioVolume: 50.5 } });
      expect(result.success).toBe(false);
    });
  });
});

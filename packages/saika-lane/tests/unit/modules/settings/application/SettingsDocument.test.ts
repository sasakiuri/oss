// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { normalizeSettingsDraft, toLegacyUserPreferences } from '@/main/modules/settings/application/SettingsDocument';

describe('settings document normalization', () => {
  it('disables direct printing when persisted options are invalid', () => {
    expect(normalizeSettingsDraft({ printing: { deviceName: 'queue-1', copies: 0 } }).printing.deviceName).toBe('');
  });

  it('migrates device-dependent preferences once without changing the supplied document', () => {
    const input = Object.freeze({
      connection: Object.freeze({ portName: 'COM10', manufacturer: 'KOHTO', deviceId: 'BP216' }),
      userPreferences: Object.freeze({ discipline: 'BEAM_RIFLE_10M', competitionTypeId: 'BR60S' }),
    });

    const normalized = normalizeSettingsDraft(input);

    expect(normalized.connection.deviceId).toBe('BPT216');
    expect(normalized.userPreferences).toMatchObject({ discipline: 'BEAM_PISTOL_10M', competitionTypeId: 'BP60' });
    expect(normalizeSettingsDraft(normalized)).toEqual(normalized);
    expect(input.connection.deviceId).toBe('BP216');
    expect(input.userPreferences.discipline).toBe('BEAM_RIFLE_10M');
  });

  it('leaves Lane identity allocation to the persistence owner', () => {
    const normalized = normalizeSettingsDraft({ mqtt: { laneId: 'invalid', laneAlias: 'Lane 12' } });

    expect(normalized.mqtt.laneId).toBeUndefined();
    expect(normalized.mqtt.laneAlias).toBe('Lane 12');
    expect(normalizeSettingsDraft(normalized)).toEqual(normalized);
  });

  it('preserves the distinction between omitted and explicitly stored preference defaults', () => {
    const preferences = normalizeSettingsDraft({}).userPreferences;

    expect(toLegacyUserPreferences(preferences)).toEqual({});
    expect(toLegacyUserPreferences(preferences, { laneNumber: 1, audioVolume: 50, competitionTypeId: '' })).toEqual({
      laneNumber: 1,
      audioVolume: 50,
      competitionTypeId: '',
    });
  });
});

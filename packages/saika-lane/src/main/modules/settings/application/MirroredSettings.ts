// SPDX-License-Identifier: MIT
import { ConnectionSettingsSchema, type ConnectionSettingsDto } from '@/shared/ipc/contracts';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

/*
 * electron-store keys into which AppSettingsStore mirrors parts of settings.json. Reading a mirror
 * neither reads nor rewrites settings.json.
 */
export const MIRRORED_LANE_ID_KEY = 'mqtt.laneId';
export const MIRRORED_MQTT_SETTINGS_KEY = 'mqtt.settings';
export const MIRRORED_USER_PREFERENCES_KEY = 'userPreferences';
export const MIRRORED_CONNECTION_SETTINGS_KEY = 'connectionSettings';

/** The mirrored Lane id; empty when it was never mirrored. */
export function readMirroredLaneId(storage: Pick<ILocalStorage, 'get'>): string {
  return storage.get<string>(MIRRORED_LANE_ID_KEY) ?? '';
}

/** The mirrored Lane Alias, when one is stored. */
export function readMirroredLaneAlias(storage: Pick<ILocalStorage, 'get'>): string | undefined {
  return storage.get<{ laneAlias?: string }>(MIRRORED_MQTT_SETTINGS_KEY)?.laneAlias;
}

/** The mirrored Lane number, when one is stored. */
export function readMirroredLaneNumber(storage: Pick<ILocalStorage, 'get'>): number | undefined {
  return storage.get<{ laneNumber?: number }>(MIRRORED_USER_PREFERENCES_KEY)?.laneNumber;
}

/** The mirrored target connection settings, or null when none are stored; throws when they are malformed. */
export function readMirroredConnectionSettings(storage: Pick<ILocalStorage, 'get'>): ConnectionSettingsDto | null {
  return ConnectionSettingsSchema.nullable().parse(storage.get(MIRRORED_CONNECTION_SETTINGS_KEY) ?? null);
}

// SPDX-License-Identifier: MIT
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

/** electron-store key into which AppSettingsStore mirrors the Lane id from settings.json. */
export const MIRRORED_LANE_ID_KEY = 'mqtt.laneId';

/** Reads the mirrored Lane id without reading or rewriting settings.json; empty when it was never mirrored. */
export function readMirroredLaneId(storage: Pick<ILocalStorage, 'get'>): string {
  return storage.get<string>(MIRRORED_LANE_ID_KEY) ?? '';
}

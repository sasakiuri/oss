// SPDX-License-Identifier: MIT
import {
  BPT216_DEVICE_ID,
  BPT216_RS232_DEVICE_ID,
  DEVICE_DEFINITIONS,
  DISAG_RED_DOT_PISTOL_DEVICE_ID,
  DISAG_RED_DOT_RIFLE_DEVICE_ID,
  LEGACY_BP216_DEVICE_ID,
  type DeviceDefinition,
} from '@/shared/target/targetDevices';

export const DISAG_RED_DOT_DEVICE_IDS = [DISAG_RED_DOT_RIFLE_DEVICE_ID, DISAG_RED_DOT_PISTOL_DEVICE_ID] as const;

export type DisagRedDotDeviceId = (typeof DISAG_RED_DOT_DEVICE_IDS)[number];
export type DisagRedDotDiscipline = 'AIR_RIFLE_10M' | 'AIR_PISTOL_10M';
export type DisagRedDotTargetType = 'RIFLE' | 'PISTOL';

export function isDisagRedDotDeviceId(deviceId: string | undefined): deviceId is DisagRedDotDeviceId {
  return DISAG_RED_DOT_DEVICE_IDS.some((candidate) => candidate === deviceId);
}

export function isBpt216DeviceId(deviceId: string | undefined): boolean {
  return deviceId === BPT216_DEVICE_ID || deviceId === BPT216_RS232_DEVICE_ID || deviceId === LEGACY_BP216_DEVICE_ID;
}

export function getDisagRedDotDiscipline(deviceId: string | undefined): DisagRedDotDiscipline | null {
  if (deviceId === DISAG_RED_DOT_RIFLE_DEVICE_ID) {
    return 'AIR_RIFLE_10M';
  }
  if (deviceId === DISAG_RED_DOT_PISTOL_DEVICE_ID) {
    return 'AIR_PISTOL_10M';
  }
  return null;
}

export function getDisagRedDotTargetType(deviceId: string | undefined): DisagRedDotTargetType | null {
  if (deviceId === DISAG_RED_DOT_RIFLE_DEVICE_ID) {
    return 'RIFLE';
  }
  if (deviceId === DISAG_RED_DOT_PISTOL_DEVICE_ID) {
    return 'PISTOL';
  }
  return null;
}

/** Resolves a canonical or legacy device ID to its static definition. */
export function findTargetDeviceDefinition(deviceId: string | undefined): DeviceDefinition | undefined {
  if (!deviceId) {
    return undefined;
  }

  return DEVICE_DEFINITIONS.find((definition) => definition.id === deviceId || definition.aliases?.includes(deviceId));
}

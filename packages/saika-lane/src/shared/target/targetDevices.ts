// SPDX-License-Identifier: MIT
/**
 * Static facts about supported target devices, shared by the main process
 * (connection, adapters) and the renderer (shot feedback). Device ids and
 * aliases are persisted in settings and sent to Director; never change them.
 */
import type { Discipline } from '@/shared/ipc/schemas/common';

export const DISAG_RED_DOT_RIFLE_DEVICE_ID = 'DISAG_KT_RDT_ZIE_1_RIFLE';
export const DISAG_RED_DOT_PISTOL_DEVICE_ID = 'DISAG_KT_RDT_ZIE_1_PISTOL';

export const BPT216_DEVICE_ID = 'BPT216';
export const BPT216_RS232_DEVICE_ID = 'BPT216_RS232';
export const LEGACY_BP216_DEVICE_ID = 'BP216';

export interface SerialConfig {
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: 'none' | 'even' | 'odd';
}

/** Static definition of one target device; adding a device only requires adding an entry to DEVICE_DEFINITIONS. */
export interface DeviceDefinition {
  readonly id: string;
  readonly aliases?: readonly string[];
  readonly manufacturer: 'KOHTO' | 'SIUS' | 'MEYTON' | 'DISAG' | 'CUSTOM';
  readonly modelName: string;
  readonly displayName: string;
  readonly serialConfig: SerialConfig;
  readonly supportedDisciplines: readonly Discipline[];
  /**
   * The adapter that decodes this device's frames under its id and aliases:
   * its manufacturer's adapter or the dedicated BPT-216 adapter. Without one
   * the device offers no serial connection.
   */
  readonly adapter?: 'MANUFACTURER' | 'BPT216';
  /** The renderer plays the impact sound as soon as a shot frame is decoded. */
  readonly immediateShotFeedback?: true;
}

export const DEVICE_DEFINITIONS: readonly DeviceDefinition[] = [
  {
    id: 'MT201',
    manufacturer: 'KOHTO',
    modelName: 'MT201',
    displayName: 'Kohto Electronics MT201',
    serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['BEAM_RIFLE_10M'],
    adapter: 'MANUFACTURER',
    immediateShotFeedback: true,
  },
  {
    id: BPT216_DEVICE_ID,
    aliases: [LEGACY_BP216_DEVICE_ID],
    manufacturer: 'KOHTO',
    modelName: 'BPT-216',
    displayName: 'Kohto Electronics BPT-216 (BP-217 I/F)',
    serialConfig: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['BEAM_PISTOL_10M'],
    adapter: 'BPT216',
    immediateShotFeedback: true,
  },
  {
    id: BPT216_RS232_DEVICE_ID,
    manufacturer: 'KOHTO',
    modelName: 'BPT-216',
    displayName: 'Kohto Electronics BPT-216 (RS-232C)',
    serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['BEAM_PISTOL_10M'],
    adapter: 'BPT216',
    immediateShotFeedback: true,
  },
  {
    id: 'HS10',
    manufacturer: 'SIUS',
    modelName: 'HS10',
    displayName: 'SIUS HS10',
    serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['AIR_RIFLE_10M', 'AIR_PISTOL_10M'],
  },
  {
    id: 'HS25',
    manufacturer: 'SIUS',
    modelName: 'HS25',
    displayName: 'SIUS HS25',
    serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['PISTOL_25M'],
  },
  {
    id: 'MEYTON_DEFAULT',
    manufacturer: 'MEYTON',
    modelName: 'Meyton',
    displayName: 'Meyton Standard',
    serialConfig: { baudRate: 19200, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['AIR_RIFLE_10M', 'AIR_PISTOL_10M', 'RIFLE_50M', 'PISTOL_25M'],
  },
  {
    id: 'DISAG_DEFAULT',
    manufacturer: 'DISAG',
    modelName: 'DISAG',
    displayName: 'DISAG Standard',
    serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['AIR_RIFLE_10M', 'AIR_PISTOL_10M', 'RIFLE_50M', 'PISTOL_25M'],
  },
  {
    id: DISAG_RED_DOT_RIFLE_DEVICE_ID,
    manufacturer: 'DISAG',
    modelName: 'KT RDT ZIE 1',
    displayName: 'DISAG RedDot Rifle',
    serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['AIR_RIFLE_10M'],
    adapter: 'MANUFACTURER',
    immediateShotFeedback: true,
  },
  {
    id: DISAG_RED_DOT_PISTOL_DEVICE_ID,
    manufacturer: 'DISAG',
    modelName: 'KT RDT ZIE 1',
    displayName: 'DISAG RedDot Pistol',
    serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['AIR_PISTOL_10M'],
    adapter: 'MANUFACTURER',
    immediateShotFeedback: true,
  },
  {
    id: 'CUSTOM',
    manufacturer: 'CUSTOM',
    modelName: 'Custom',
    displayName: 'Custom Device',
    serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: [
      'AIR_RIFLE_10M',
      'AIR_PISTOL_10M',
      'RIFLE_50M',
      'RIFLE_300M',
      'PISTOL_50M',
      'PISTOL_25M',
      'BEAM_RIFLE_10M',
      'BEAM_PISTOL_10M',
    ],
    adapter: 'MANUFACTURER',
  },
] as const;

/** Device ids, including legacy aliases, whose shots play the impact sound as soon as they are decoded. */
export const IMMEDIATE_SHOT_FEEDBACK_DEVICE_IDS: ReadonlySet<string> = new Set(
  DEVICE_DEFINITIONS.filter((definition) => definition.immediateShotFeedback).flatMap((definition) => [
    definition.id,
    ...(definition.aliases ?? []),
  ]),
);

// SPDX-License-Identifier: MIT
import type { SerialConfig } from './TargetDevice';

/**
 * DeviceDefinition — Static definition data for target devices
 *
 * Data-driven definition replacing TargetDevice static factory methods.
 * Adding a new device only requires adding an entry to this array.
 */
export interface DeviceDefinition {
  readonly id: string;
  readonly manufacturer: 'KOHTO' | 'SIUS' | 'MEYTON' | 'DISAG' | 'CUSTOM';
  readonly modelName: string;
  readonly displayName: string;
  readonly serialConfig: SerialConfig;
  readonly supportedDisciplines: readonly (
    | 'BEAM_RIFLE_10M'
    | 'AIR_RIFLE_10M'
    | 'AIR_PISTOL_10M'
    | 'RIFLE_50M'
    | 'PISTOL_25M'
  )[];
}

export const DEVICE_DEFINITIONS: readonly DeviceDefinition[] = [
  {
    id: 'MT201',
    manufacturer: 'KOHTO',
    modelName: 'MT201',
    displayName: 'Kohto Electronics MT201',
    serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['BEAM_RIFLE_10M'],
  },
  {
    id: 'BP216',
    manufacturer: 'KOHTO',
    modelName: 'BP216',
    displayName: 'Kohto Electronics BP216',
    serialConfig: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['BEAM_RIFLE_10M'],
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
    id: 'DISAG_KT_RDT_ZIE_1_RIFLE',
    manufacturer: 'DISAG',
    modelName: 'KT RDT ZIE 1',
    displayName: 'DISAG RedDot Rifle',
    serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['AIR_RIFLE_10M'],
  },
  {
    id: 'RDT_ZIE1_PISTOL',
    manufacturer: 'CUSTOM',
    modelName: 'RDT-ZIE1',
    displayName: 'RDT-ZIE1 Pistol',
    serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['AIR_PISTOL_10M', 'PISTOL_25M'],
  },
  {
    id: 'CUSTOM',
    manufacturer: 'CUSTOM',
    modelName: 'Custom',
    displayName: 'Custom Device',
    serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    supportedDisciplines: ['AIR_RIFLE_10M', 'AIR_PISTOL_10M', 'RIFLE_50M', 'PISTOL_25M', 'BEAM_RIFLE_10M'],
  },
] as const;

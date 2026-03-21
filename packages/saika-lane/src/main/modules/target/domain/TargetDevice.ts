// SPDX-License-Identifier: MIT
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { DeviceDefinition } from './targetDeviceDefinitions';
import { DEVICE_DEFINITIONS } from './targetDeviceDefinitions';

/**
 * Serial port configuration type
 */
export interface SerialConfig {
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: 'none' | 'even' | 'odd';
}

// Build Map from definition data (once at startup)
const deviceMap = new Map<string, DeviceDefinition>();
for (const def of DEVICE_DEFINITIONS) {
  deviceMap.set(def.id, def);
}

/**
 * TargetDevice value object
 *
 * An immutable object representing an electronic target device.
 * Each device has a manufacturer, model name, communication settings, and supported disciplines.
 * Device definitions are managed in a data-driven manner in targetDeviceDefinitions.ts.
 */
export class TargetDevice {
  readonly id: string;
  readonly manufacturer: TargetManufacturer;
  readonly modelName: string;
  readonly displayName: string;
  readonly baudRate: number;
  readonly dataBits: 5 | 6 | 7 | 8;
  readonly stopBits: 1 | 1.5 | 2;
  readonly parity: 'none' | 'even' | 'odd';
  readonly supportedDisciplines: Discipline[];

  private constructor(
    id: string,
    manufacturer: TargetManufacturer,
    modelName: string,
    displayName: string,
    serialConfig: SerialConfig,
    supportedDisciplines: Discipline[],
  ) {
    this.id = id;
    this.manufacturer = manufacturer;
    this.modelName = modelName;
    this.displayName = displayName;
    this.baudRate = serialConfig.baudRate;
    this.dataBits = serialConfig.dataBits;
    this.stopBits = serialConfig.stopBits;
    this.parity = serialConfig.parity;
    this.supportedDisciplines = [...supportedDisciplines];

    Object.freeze(this.supportedDisciplines);
    Object.freeze(this);
  }

  private static fromDefinition(def: DeviceDefinition): TargetDevice {
    return new TargetDevice(
      def.id,
      TargetManufacturer.fromValue(def.manufacturer),
      def.modelName,
      def.displayName,
      def.serialConfig,
      def.supportedDisciplines.map((d) => Discipline.fromValue(d)),
    );
  }

  /**
   * Retrieves a device by ID.
   *
   * @param id - Device ID
   * @returns TargetDevice instance
   * @throws {DomainError} If the ID is invalid
   */
  static fromId(id: string): TargetDevice {
    const def = deviceMap.get(id);
    if (!def) {
      throw ErrorCatalog.createError('UNKNOWN_DEVICE_ID', { detail: `Unknown device ID: ${id}` });
    }
    return TargetDevice.fromDefinition(def);
  }

  /**
   * Retrieves a list of devices by manufacturer.
   *
   * @param manufacturer - Manufacturer
   * @returns Array of TargetDevice instances
   */
  static getByManufacturer(manufacturer: TargetManufacturer): TargetDevice[] {
    return DEVICE_DEFINITIONS.filter((def) => def.manufacturer === manufacturer.value).map((def) =>
      TargetDevice.fromDefinition(def),
    );
  }

  /**
   * Retrieves all devices.
   *
   * @returns Array of TargetDevice instances
   */
  static getAll(): TargetDevice[] {
    return DEVICE_DEFINITIONS.map((def) => TargetDevice.fromDefinition(def));
  }

  /**
   * Returns the serial port configuration.
   */
  getSerialConfig(): SerialConfig {
    return {
      baudRate: this.baudRate,
      dataBits: this.dataBits,
      stopBits: this.stopBits,
      parity: this.parity,
    };
  }

  /**
   * Checks whether the given discipline is supported.
   */
  supportsDiscipline(discipline: Discipline): boolean {
    return this.supportedDisciplines.some((d) => d.equals(discipline));
  }

  /**
   * Checks equality with another TargetDevice.
   */
  equals(other: TargetDevice): boolean {
    return this.id === other.id;
  }
}

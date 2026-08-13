// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { TargetDevice } from '@/main/modules/target/domain/TargetDevice';
import { DEVICE_DEFINITIONS } from '@/main/modules/target/domain/targetDeviceDefinitions';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { DomainError } from '@/shared/errors/DomainError';

describe('TargetDevice value object', () => {
  // ============================
  // Registry consistency tests
  // ============================
  describe('Registry consistency', () => {
    it('should have no duplicate IDs in definition data', () => {
      const ids = DEVICE_DEFINITIONS.map((d) => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have non-empty supportedDisciplines for all definitions', () => {
      for (const def of DEVICE_DEFINITIONS) {
        expect(def.supportedDisciplines.length).toBeGreaterThan(0);
      }
    });

    it('should have all required fields in every definition', () => {
      for (const def of DEVICE_DEFINITIONS) {
        expect(def.id).toBeTruthy();
        expect(def.manufacturer).toBeTruthy();
        expect(def.serialConfig).toBeDefined();
        expect(def.serialConfig.baudRate).toBeGreaterThan(0);
        expect(def.serialConfig.dataBits).toBeDefined();
        expect(def.serialConfig.stopBits).toBeDefined();
        expect(def.serialConfig.parity).toBeDefined();
      }
    });

    it('should have getAll() count match definition data count', () => {
      const devices = TargetDevice.getAll();
      expect(devices.length).toBe(DEVICE_DEFINITIONS.length);
    });

    it('should retrieve all definitions via fromId()', () => {
      for (const def of DEVICE_DEFINITIONS) {
        const device = TargetDevice.fromId(def.id);
        expect(device.id).toBe(def.id);
        expect(device.displayName).toBe(def.displayName);
      }
    });
  });

  // ============================
  // Individual device verification
  // ============================
  describe('Factory methods', () => {
    describe('MT201', () => {
      it('should correctly create an MT201 device', () => {
        const device = TargetDevice.fromId('MT201');
        expect(device.id).toBe('MT201');
        expect(device.manufacturer.equals(TargetManufacturer.kohto())).toBe(true);
        expect(device.modelName).toBe('MT201');
        expect(device.displayName).toBe('Kohto Electronics MT201');
        expect(device.baudRate).toBe(9600);
        expect(device.dataBits).toBe(8);
        expect(device.stopBits).toBe(1);
        expect(device.parity).toBe('none');
        expect(device.supportedDisciplines).toHaveLength(1);
      });

      it('should have correct supported disciplines for MT201', () => {
        const device = TargetDevice.fromId('MT201');
        expect(device.supportsDiscipline(Discipline.beamRifle10m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.airRifle10m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.airPistol10m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.rifle50m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.pistol25m())).toBe(false);
      });
    });

    describe('BP216', () => {
      it('should correctly create a BP216 device', () => {
        const device = TargetDevice.fromId('BP216');
        expect(device.id).toBe('BP216');
        expect(device.manufacturer.equals(TargetManufacturer.kohto())).toBe(true);
        expect(device.modelName).toBe('BP216');
        expect(device.displayName).toBe('Kohto Electronics BP216');
        expect(device.baudRate).toBe(115200);
        expect(device.dataBits).toBe(8);
        expect(device.stopBits).toBe(1);
        expect(device.parity).toBe('none');
        expect(device.supportedDisciplines).toHaveLength(1);
      });

      it('should support beam rifle only for BP216', () => {
        const device = TargetDevice.fromId('BP216');
        expect(device.supportsDiscipline(Discipline.beamRifle10m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.airRifle10m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.airPistol10m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.rifle50m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.pistol25m())).toBe(false);
      });
    });

    describe('HS10', () => {
      it('should correctly create an HS10 device', () => {
        const device = TargetDevice.fromId('HS10');
        expect(device.id).toBe('HS10');
        expect(device.manufacturer.equals(TargetManufacturer.sius())).toBe(true);
        expect(device.modelName).toBe('HS10');
        expect(device.displayName).toBe('SIUS HS10');
        expect(device.baudRate).toBe(9600);
        expect(device.dataBits).toBe(8);
        expect(device.stopBits).toBe(1);
        expect(device.parity).toBe('none');
        expect(device.supportedDisciplines).toHaveLength(2);
      });

      it('should support 10m disciplines for HS10', () => {
        const device = TargetDevice.fromId('HS10');
        expect(device.supportsDiscipline(Discipline.airRifle10m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.airPistol10m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.rifle50m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.pistol25m())).toBe(false);
      });
    });

    describe('HS25', () => {
      it('should correctly create an HS25 device', () => {
        const device = TargetDevice.fromId('HS25');
        expect(device.id).toBe('HS25');
        expect(device.manufacturer.equals(TargetManufacturer.sius())).toBe(true);
        expect(device.modelName).toBe('HS25');
        expect(device.displayName).toBe('SIUS HS25');
        expect(device.baudRate).toBe(9600);
        expect(device.dataBits).toBe(8);
        expect(device.stopBits).toBe(1);
        expect(device.parity).toBe('none');
        expect(device.supportedDisciplines).toHaveLength(1);
      });

      it('should support 25m pistol only for HS25', () => {
        const device = TargetDevice.fromId('HS25');
        expect(device.supportsDiscipline(Discipline.pistol25m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.airRifle10m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.airPistol10m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.rifle50m())).toBe(false);
      });
    });

    describe('MEYTON_DEFAULT', () => {
      it('should correctly create a Meyton default device', () => {
        const device = TargetDevice.fromId('MEYTON_DEFAULT');
        expect(device.id).toBe('MEYTON_DEFAULT');
        expect(device.manufacturer.equals(TargetManufacturer.meyton())).toBe(true);
        expect(device.modelName).toBe('Meyton');
        expect(device.displayName).toBe('Meyton Standard');
        expect(device.baudRate).toBe(19200);
        expect(device.dataBits).toBe(8);
        expect(device.stopBits).toBe(1);
        expect(device.parity).toBe('none');
        expect(device.supportedDisciplines).toHaveLength(4);
      });

      it('should support the 4 main disciplines for Meyton default', () => {
        const device = TargetDevice.fromId('MEYTON_DEFAULT');
        expect(device.supportsDiscipline(Discipline.airRifle10m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.airPistol10m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.rifle50m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.pistol25m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.beamRifle10m())).toBe(false);
      });
    });

    describe('DISAG_DEFAULT', () => {
      it('should correctly create a DISAG default device', () => {
        const device = TargetDevice.fromId('DISAG_DEFAULT');
        expect(device.id).toBe('DISAG_DEFAULT');
        expect(device.manufacturer.equals(TargetManufacturer.disag())).toBe(true);
        expect(device.modelName).toBe('DISAG');
        expect(device.displayName).toBe('DISAG Standard');
        expect(device.baudRate).toBe(9600);
        expect(device.dataBits).toBe(8);
        expect(device.stopBits).toBe(1);
        expect(device.parity).toBe('none');
        expect(device.supportedDisciplines).toHaveLength(4);
      });

      it('should support the 4 main disciplines for DISAG default', () => {
        const device = TargetDevice.fromId('DISAG_DEFAULT');
        expect(device.supportsDiscipline(Discipline.airRifle10m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.airPistol10m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.rifle50m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.pistol25m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.beamRifle10m())).toBe(false);
      });
    });

    describe('DISAG_KT_RDT_ZIE_1_RIFLE', () => {
      it('should correctly create a DISAG RedDot rifle device', () => {
        const device = TargetDevice.fromId('DISAG_KT_RDT_ZIE_1_RIFLE');
        expect(device.id).toBe('DISAG_KT_RDT_ZIE_1_RIFLE');
        expect(device.manufacturer.equals(TargetManufacturer.disag())).toBe(true);
        expect(device.modelName).toBe('KT RDT ZIE 1');
        expect(device.displayName).toBe('DISAG RedDot Rifle');
        expect(device.baudRate).toBe(9600);
        expect(device.dataBits).toBe(8);
        expect(device.stopBits).toBe(1);
        expect(device.parity).toBe('none');
        expect(device.supportedDisciplines).toHaveLength(1);
      });

      it('should support only 10m air rifle for the RedDot rifle profile', () => {
        const device = TargetDevice.fromId('DISAG_KT_RDT_ZIE_1_RIFLE');
        expect(device.supportsDiscipline(Discipline.airRifle10m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.rifle50m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.airPistol10m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.pistol25m())).toBe(false);
      });
    });

    describe('DISAG_KT_RDT_ZIE_1_PISTOL', () => {
      it('should correctly create a DISAG RedDot pistol device', () => {
        const device = TargetDevice.fromId('DISAG_KT_RDT_ZIE_1_PISTOL');
        expect(device.id).toBe('DISAG_KT_RDT_ZIE_1_PISTOL');
        expect(device.manufacturer.equals(TargetManufacturer.disag())).toBe(true);
        expect(device.modelName).toBe('KT RDT ZIE 1');
        expect(device.displayName).toBe('DISAG RedDot Pistol');
        expect(device.baudRate).toBe(9600);
        expect(device.dataBits).toBe(8);
        expect(device.stopBits).toBe(1);
        expect(device.parity).toBe('none');
        expect(device.supportedDisciplines).toHaveLength(1);
      });

      it('should support only 10m air pistol for the RedDot pistol profile', () => {
        const device = TargetDevice.fromId('DISAG_KT_RDT_ZIE_1_PISTOL');
        expect(device.supportsDiscipline(Discipline.airPistol10m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.pistol25m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.airRifle10m())).toBe(false);
        expect(device.supportsDiscipline(Discipline.rifle50m())).toBe(false);
      });
    });

    describe('CUSTOM', () => {
      it('should correctly create a Custom Device', () => {
        const device = TargetDevice.fromId('CUSTOM');
        expect(device.id).toBe('CUSTOM');
        expect(device.manufacturer.equals(TargetManufacturer.custom())).toBe(true);
        expect(device.modelName).toBe('Custom');
        expect(device.displayName).toBe('Custom Device');
        expect(device.baudRate).toBe(9600);
        expect(device.dataBits).toBe(8);
        expect(device.stopBits).toBe(1);
        expect(device.parity).toBe('none');
        expect(device.supportedDisciplines).toHaveLength(5);
      });

      it('should support all disciplines for Custom Device', () => {
        const device = TargetDevice.fromId('CUSTOM');
        expect(device.supportsDiscipline(Discipline.airRifle10m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.airPistol10m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.rifle50m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.pistol25m())).toBe(true);
        expect(device.supportsDiscipline(Discipline.beamRifle10m())).toBe(true);
      });
    });
  });

  // ============================
  // fromId() method
  // ============================
  describe('fromId() method', () => {
    describe('Normal cases', () => {
      it.each([
        ['MT201', 'Kohto Electronics MT201'],
        ['BP216', 'Kohto Electronics BP216'],
        ['HS10', 'SIUS HS10'],
        ['HS25', 'SIUS HS25'],
        ['MEYTON_DEFAULT', 'Meyton Standard'],
        ['DISAG_DEFAULT', 'DISAG Standard'],
        ['DISAG_KT_RDT_ZIE_1_RIFLE', 'DISAG RedDot Rifle'],
        ['DISAG_KT_RDT_ZIE_1_PISTOL', 'DISAG RedDot Pistol'],
        ['CUSTOM', 'Custom Device'],
      ])('should create a device from ID %s', (id, expectedDisplayName) => {
        const device = TargetDevice.fromId(id);
        expect(device.id).toBe(id);
        expect(device.displayName).toBe(expectedDisplayName);
      });
    });

    describe('Error cases', () => {
      it('should throw an error for a non-existent ID', () => {
        try {
          TargetDevice.fromId('UNKNOWN');
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('UNKNOWN_DEVICE_ID');
        }
      });

      it('should throw an error for a lowercase ID', () => {
        try {
          TargetDevice.fromId('mt201');
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('UNKNOWN_DEVICE_ID');
        }
      });

      it('should throw an error for an empty string', () => {
        try {
          TargetDevice.fromId('');
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe('UNKNOWN_DEVICE_ID');
        }
      });

      it('should throw an error for null', () => {
        expect(() => TargetDevice.fromId(null as any)).toThrow();
      });

      it('should throw an error for undefined', () => {
        expect(() => TargetDevice.fromId(undefined as any)).toThrow();
      });
    });
  });

  // ============================
  // getByManufacturer() method
  // ============================
  describe('getByManufacturer() method', () => {
    it('should retrieve the list of Kohto Electronics devices', () => {
      const devices = TargetDevice.getByManufacturer(TargetManufacturer.kohto());
      expect(devices).toHaveLength(2);
      expect(devices.every((d) => d.manufacturer.value === 'KOHTO')).toBe(true);
      expect(devices.some((d) => d.id === 'MT201')).toBe(true);
      expect(devices.some((d) => d.id === 'BP216')).toBe(true);
    });

    it('should retrieve the list of SIUS devices', () => {
      const devices = TargetDevice.getByManufacturer(TargetManufacturer.sius());
      expect(devices).toHaveLength(2);
      expect(devices.every((d) => d.manufacturer.value === 'SIUS')).toBe(true);
      expect(devices.some((d) => d.id === 'HS10')).toBe(true);
      expect(devices.some((d) => d.id === 'HS25')).toBe(true);
    });

    it('should retrieve the list of Meyton devices', () => {
      const devices = TargetDevice.getByManufacturer(TargetManufacturer.meyton());
      expect(devices).toHaveLength(1);
      expect(devices[0]?.id).toBe('MEYTON_DEFAULT');
    });

    it('should retrieve the list of DISAG devices', () => {
      const devices = TargetDevice.getByManufacturer(TargetManufacturer.disag());
      expect(devices).toHaveLength(3);
      expect(devices.every((d) => d.manufacturer.value === 'DISAG')).toBe(true);
      expect(devices.some((d) => d.id === 'DISAG_DEFAULT')).toBe(true);
      expect(devices.some((d) => d.id === 'DISAG_KT_RDT_ZIE_1_RIFLE')).toBe(true);
      expect(devices.some((d) => d.id === 'DISAG_KT_RDT_ZIE_1_PISTOL')).toBe(true);
    });

    it('should retrieve the list of Custom devices', () => {
      const devices = TargetDevice.getByManufacturer(TargetManufacturer.custom());
      expect(devices).toHaveLength(1);
      expect(devices.every((d) => d.manufacturer.value === 'CUSTOM')).toBe(true);
      expect(devices.some((d) => d.id === 'CUSTOM')).toBe(true);
    });
  });

  // ============================
  // getAll() method
  // ============================
  describe('getAll() method', () => {
    it('should retrieve all devices', () => {
      const devices = TargetDevice.getAll();
      expect(devices).toHaveLength(9);
    });

    it('should contain all devices without duplicates', () => {
      const devices = TargetDevice.getAll();
      const ids = devices.map((d) => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(9);
    });

    it('should contain all correct device IDs', () => {
      const devices = TargetDevice.getAll();
      const ids = devices.map((d) => d.id);
      expect(ids).toContain('MT201');
      expect(ids).toContain('BP216');
      expect(ids).toContain('HS10');
      expect(ids).toContain('HS25');
      expect(ids).toContain('MEYTON_DEFAULT');
      expect(ids).toContain('DISAG_DEFAULT');
      expect(ids).toContain('DISAG_KT_RDT_ZIE_1_RIFLE');
      expect(ids).toContain('DISAG_KT_RDT_ZIE_1_PISTOL');
      expect(ids).toContain('CUSTOM');
    });
  });

  // ============================
  // supportsDiscipline() method
  // ============================
  describe('supportsDiscipline() method', () => {
    it('should support beam rifle for MT201', () => {
      const device = TargetDevice.fromId('MT201');
      expect(device.supportsDiscipline(Discipline.beamRifle10m())).toBe(true);
    });

    it('should not support 10m air rifle for MT201', () => {
      const device = TargetDevice.fromId('MT201');
      expect(device.supportsDiscipline(Discipline.airRifle10m())).toBe(false);
    });

    it('should support 25m pistol for HS25', () => {
      const device = TargetDevice.fromId('HS25');
      expect(device.supportsDiscipline(Discipline.pistol25m())).toBe(true);
    });

    it('should not support 10m air rifle for HS25', () => {
      const device = TargetDevice.fromId('HS25');
      expect(device.supportsDiscipline(Discipline.airRifle10m())).toBe(false);
    });

    it('should support all disciplines for Custom Device', () => {
      const device = TargetDevice.fromId('CUSTOM');
      expect(device.supportsDiscipline(Discipline.airRifle10m())).toBe(true);
      expect(device.supportsDiscipline(Discipline.airPistol10m())).toBe(true);
      expect(device.supportsDiscipline(Discipline.rifle50m())).toBe(true);
      expect(device.supportsDiscipline(Discipline.pistol25m())).toBe(true);
      expect(device.supportsDiscipline(Discipline.beamRifle10m())).toBe(true);
    });
  });

  // ============================
  // equals() method
  // ============================
  describe('equals() method', () => {
    it('should return true when comparing the same MT201 devices', () => {
      const device1 = TargetDevice.fromId('MT201');
      const device2 = TargetDevice.fromId('MT201');
      expect(device1.equals(device2)).toBe(true);
    });

    it('should return false when comparing different devices', () => {
      const device1 = TargetDevice.fromId('MT201');
      const device2 = TargetDevice.fromId('BP216');
      expect(device1.equals(device2)).toBe(false);
    });

    it('should return true when comparing with itself', () => {
      const device = TargetDevice.fromId('MT201');
      expect(device.equals(device)).toBe(true);
    });

    it('should return false for different SIUS devices with equals', () => {
      const device1 = TargetDevice.fromId('HS10');
      const device2 = TargetDevice.fromId('HS25');
      expect(device1.equals(device2)).toBe(false);
    });
  });

  // ============================
  // getSerialConfig() method
  // ============================
  describe('getSerialConfig() method', () => {
    it('should retrieve MT201 serial config', () => {
      const device = TargetDevice.fromId('MT201');
      const config = device.getSerialConfig();
      expect(config.baudRate).toBe(9600);
      expect(config.dataBits).toBe(8);
      expect(config.stopBits).toBe(1);
      expect(config.parity).toBe('none');
    });

    it('should retrieve BP216 serial config (high-speed communication)', () => {
      const device = TargetDevice.fromId('BP216');
      const config = device.getSerialConfig();
      expect(config.baudRate).toBe(115200);
      expect(config.dataBits).toBe(8);
      expect(config.stopBits).toBe(1);
      expect(config.parity).toBe('none');
    });

    it('should retrieve Meyton serial config (19200bps)', () => {
      const device = TargetDevice.fromId('MEYTON_DEFAULT');
      const config = device.getSerialConfig();
      expect(config.baudRate).toBe(19200);
      expect(config.dataBits).toBe(8);
      expect(config.stopBits).toBe(1);
      expect(config.parity).toBe('none');
    });

    it('should return the config in the correct object format', () => {
      const device = TargetDevice.fromId('HS10');
      const config = device.getSerialConfig();
      expect(config).toHaveProperty('baudRate');
      expect(config).toHaveProperty('dataBits');
      expect(config).toHaveProperty('stopBits');
      expect(config).toHaveProperty('parity');
    });
  });

  // ============================
  // Immutability
  // ============================
  describe('Immutability', () => {
    it('should have readonly properties', () => {
      const device = TargetDevice.fromId('MT201');
      expect(() => {
        (device as any).id = 'BP216';
      }).toThrow();
    });

    it('should have readonly supportedDisciplines', () => {
      const device = TargetDevice.fromId('MT201');
      expect(() => {
        (device as any).supportedDisciplines = [];
      }).toThrow();
    });

    it('should have a frozen supportedDisciplines array', () => {
      const device = TargetDevice.fromId('MT201');
      expect(Object.isFrozen(device.supportedDisciplines)).toBe(true);
    });

    it('should not allow adding elements to supportedDisciplines array', () => {
      const device = TargetDevice.fromId('MT201');
      expect(() => {
        (device.supportedDisciplines as any).push(Discipline.beamRifle10m());
      }).toThrow();
    });

    it('should not allow removing elements from supportedDisciplines array', () => {
      const device = TargetDevice.fromId('MT201');
      expect(() => {
        (device.supportedDisciplines as any).pop();
      }).toThrow();
    });

    it('should have readonly baudRate property', () => {
      const device = TargetDevice.fromId('MT201');
      expect(() => {
        (device as any).baudRate = 115200;
      }).toThrow();
    });

    it('should have readonly manufacturer property', () => {
      const device = TargetDevice.fromId('MT201');
      expect(() => {
        (device as any).manufacturer = TargetManufacturer.sius();
      }).toThrow();
    });
  });

  // ============================
  // Serial config diversity
  // ============================
  describe('Serial config diversity', () => {
    it('should have correct baud rates for each device', () => {
      expect(TargetDevice.fromId('MT201').baudRate).toBe(9600);
      expect(TargetDevice.fromId('BP216').baudRate).toBe(115200);
      expect(TargetDevice.fromId('HS10').baudRate).toBe(9600);
      expect(TargetDevice.fromId('HS25').baudRate).toBe(9600);
      expect(TargetDevice.fromId('MEYTON_DEFAULT').baudRate).toBe(19200);
      expect(TargetDevice.fromId('DISAG_DEFAULT').baudRate).toBe(9600);
      expect(TargetDevice.fromId('DISAG_KT_RDT_ZIE_1_RIFLE').baudRate).toBe(9600);
      expect(TargetDevice.fromId('DISAG_KT_RDT_ZIE_1_PISTOL').baudRate).toBe(9600);
      expect(TargetDevice.fromId('CUSTOM').baudRate).toBe(9600);
    });

    it('should use 8 data bits for all devices', () => {
      const devices = TargetDevice.getAll();
      devices.forEach((device) => {
        expect(device.dataBits).toBe(8);
      });
    });

    it('should use 1 stop bit for all devices', () => {
      const devices = TargetDevice.getAll();
      devices.forEach((device) => {
        expect(device.stopBits).toBe(1);
      });
    });

    it('should use no parity for all devices', () => {
      const devices = TargetDevice.getAll();
      devices.forEach((device) => {
        expect(device.parity).toBe('none');
      });
    });
  });

  // ============================
  // Device display names
  // ============================
  describe('Device display names', () => {
    it('should have appropriate display names for each device', () => {
      expect(TargetDevice.fromId('MT201').displayName).toBe('Kohto Electronics MT201');
      expect(TargetDevice.fromId('BP216').displayName).toBe('Kohto Electronics BP216');
      expect(TargetDevice.fromId('HS10').displayName).toBe('SIUS HS10');
      expect(TargetDevice.fromId('HS25').displayName).toBe('SIUS HS25');
      expect(TargetDevice.fromId('MEYTON_DEFAULT').displayName).toBe('Meyton Standard');
      expect(TargetDevice.fromId('DISAG_DEFAULT').displayName).toBe('DISAG Standard');
      expect(TargetDevice.fromId('DISAG_KT_RDT_ZIE_1_RIFLE').displayName).toBe('DISAG RedDot Rifle');
      expect(TargetDevice.fromId('DISAG_KT_RDT_ZIE_1_PISTOL').displayName).toBe('DISAG RedDot Pistol');
      expect(TargetDevice.fromId('CUSTOM').displayName).toBe('Custom Device');
    });
  });
});

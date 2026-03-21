// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { Connection } from '@/main/modules/connection/domain/Connection';
import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { DomainError } from '@/shared/errors/DomainError';

describe('Connection', () => {
  describe('Basic: Connection instance creation', () => {
    it('should create a new connection instance', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      expect(connection).toBeDefined();
      expect(connection.id).toBeDefined();
      expect(connection.manufacturer.equals(TargetManufacturer.sius())).toBe(true);
      expect(connection.status.equals(ConnectionStatus.disconnected())).toBe(true);
      expect(connection.portPath).toBe('COM3');
      expect(connection.baudRate).toBe(9600);
      expect(connection.connectedAt).toBeNull();
      expect(connection.disconnectedAt).toBeNull();
      expect(connection.lastError).toBeNull();
    });

    it('should have a unique ID for each created connection', () => {
      const connection1 = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });
      const connection2 = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      expect(connection1.id).not.toBe(connection2.id);
    });

    it('should have initial status of DISCONNECTED', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      expect(connection.status.equals(ConnectionStatus.disconnected())).toBe(true);
    });
  });

  describe('Basic: Connection creation with different manufacturers', () => {
    it('should create a connection with SIUS manufacturer', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      expect(connection.manufacturer.equals(TargetManufacturer.sius())).toBe(true);
    });

    it('should create a connection with Meyton manufacturer', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.meyton(),
        portPath: '/dev/ttyUSB0',
        baudRate: 19200,
      });

      expect(connection.manufacturer.equals(TargetManufacturer.meyton())).toBe(true);
    });

    it('should create a connection with DISAG manufacturer', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.disag(),
        portPath: 'COM5',
        baudRate: 38400,
      });

      expect(connection.manufacturer.equals(TargetManufacturer.disag())).toBe(true);
    });

    it('should create a connection with custom manufacturer', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.custom(),
        portPath: '/dev/ttyUSB1',
        baudRate: 57600,
      });

      expect(connection.manufacturer.equals(TargetManufacturer.custom())).toBe(true);
    });
  });

  describe('Basic: State transition (connect)', () => {
    it('should transition from DISCONNECTED to CONNECTED', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      expect(connection.status.equals(ConnectionStatus.disconnected())).toBe(true);

      connection = connection.connect();

      expect(connection.status.equals(ConnectionStatus.connected())).toBe(true);
    });

    it('should set connectedAt when connection is established', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      const before = new Date();
      connection = connection.connect();
      const after = new Date();

      expect(connection.connectedAt).toBeInstanceOf(Date);
      expect(connection.connectedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(connection.connectedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should clear error when connection is established', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.setError('Test error');
      expect(connection.lastError).toBe('Test error');

      connection = connection.connect();

      expect(connection.lastError).toBeNull();
    });

    it('should not modify the original connection instance (immutability)', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection.connect();

      expect(connection.status.equals(ConnectionStatus.disconnected())).toBe(true);
    });
  });

  describe('Basic: State transition (disconnect)', () => {
    it('should transition from CONNECTED to DISCONNECTED', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.connect();
      expect(connection.status.equals(ConnectionStatus.connected())).toBe(true);

      connection = connection.disconnect();

      expect(connection.status.equals(ConnectionStatus.disconnected())).toBe(true);
    });

    it('should set disconnectedAt on disconnect', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.connect();

      const before = new Date();
      connection = connection.disconnect();
      const after = new Date();

      expect(connection.disconnectedAt).toBeInstanceOf(Date);
      expect(connection.disconnectedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(connection.disconnectedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should retain connectedAt on disconnect', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.connect();
      const connectedAt = connection.connectedAt;

      connection = connection.disconnect();

      expect(connection.connectedAt).toEqual(connectedAt);
    });
  });

  describe('Basic: Transition to error state', () => {
    it('should transition from DISCONNECTED to ERROR', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.setError('Port not found');

      expect(connection.status.equals(ConnectionStatus.error())).toBe(true);
      expect(connection.lastError).toBe('Port not found');
    });

    it('should transition from CONNECTED to ERROR', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.connect();
      connection = connection.setError('Connection was lost');

      expect(connection.status.equals(ConnectionStatus.error())).toBe(true);
      expect(connection.lastError).toBe('Connection was lost');
    });

    it('should recover from ERROR to CONNECTED', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.setError('Temporary error');
      expect(connection.status.equals(ConnectionStatus.error())).toBe(true);

      connection = connection.connect();

      expect(connection.status.equals(ConnectionStatus.connected())).toBe(true);
      expect(connection.lastError).toBeNull();
    });
  });

  describe('Computed property: isConnected', () => {
    it('should return true when CONNECTED', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.connect();

      expect(connection.isConnected).toBe(true);
    });

    it('should return false when DISCONNECTED', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      expect(connection.isConnected).toBe(false);
    });

    it('should return false when ERROR', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.setError('Error');

      expect(connection.isConnected).toBe(false);
    });
  });

  describe('Computed property: isDisconnected', () => {
    it('should return true when DISCONNECTED', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      expect(connection.isDisconnected).toBe(true);
    });

    it('should return false when CONNECTED', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.connect();

      expect(connection.isDisconnected).toBe(false);
    });

    it('should return false when ERROR', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.setError('Error');

      expect(connection.isDisconnected).toBe(false);
    });
  });

  describe('Computed property: hasError', () => {
    it('should return true when ERROR', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.setError('Error');

      expect(connection.hasError).toBe(true);
    });

    it('should return false when DISCONNECTED', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      expect(connection.hasError).toBe(false);
    });

    it('should return false when CONNECTED', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.connect();

      expect(connection.hasError).toBe(false);
    });
  });

  describe('Business rule: Baud rate validation', () => {
    it('should create with common baud rate (9600)', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      expect(connection.baudRate).toBe(9600);
    });

    it('should create with common baud rate (19200)', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 19200,
      });

      expect(connection.baudRate).toBe(19200);
    });

    it('should create with common baud rate (115200)', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 115200,
      });

      expect(connection.baudRate).toBe(115200);
    });

    it('should not allow a negative baud rate', () => {
      try {
        Connection.create({
          manufacturer: TargetManufacturer.sius(),
          portPath: 'COM3',
          baudRate: -9600,
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_BAUD_RATE');
      }
    });

    it('should not allow a baud rate of 0', () => {
      try {
        Connection.create({
          manufacturer: TargetManufacturer.sius(),
          portPath: 'COM3',
          baudRate: 0,
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_BAUD_RATE');
      }
    });
  });

  describe('Business rule: Port path validation', () => {
    it('should create with Windows-style port path (COM3)', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      expect(connection.portPath).toBe('COM3');
    });

    it('should create with Linux-style port path (/dev/ttyUSB0)', () => {
      const connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: '/dev/ttyUSB0',
        baudRate: 9600,
      });

      expect(connection.portPath).toBe('/dev/ttyUSB0');
    });

    it('should not allow an empty string port path', () => {
      try {
        Connection.create({
          manufacturer: TargetManufacturer.sius(),
          portPath: '',
          baudRate: 9600,
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PORT_PATH');
      }
    });

    it('should not allow a whitespace-only port path', () => {
      try {
        Connection.create({
          manufacturer: TargetManufacturer.sius(),
          portPath: '   ',
          baudRate: 9600,
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PORT_PATH');
      }
    });
  });

  describe('Invariant: Relationship between connected and disconnected timestamps', () => {
    it('should satisfy connectedAt <= disconnectedAt', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      connection = connection.connect();

      // Wait briefly to ensure time advances (1ms wait)
      const waitUntil = Date.now() + 1;
      while (Date.now() < waitUntil) {
        // Waiting
      }

      connection = connection.disconnect();

      expect(connection.connectedAt!.getTime()).toBeLessThanOrEqual(connection.disconnectedAt!.getTime());
    });
  });

  describe('Entity equality', () => {
    it('should consider Connections with the same ID as equal', () => {
      const connection1 = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });
      const connection2 = connection1.connect();

      // Equal because the ID is unchanged
      expect(connection1.equals(connection2)).toBe(true);
    });

    it('should consider Connections with different IDs as not equal', () => {
      const connection1 = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });
      const connection2 = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      expect(connection1.equals(connection2)).toBe(false);
    });
  });

  describe('Complex scenario: Connect, disconnect, reconnect', () => {
    it('should handle multiple connect/disconnect cycles', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      // First connection
      connection = connection.connect();
      expect(connection.isConnected).toBe(true);
      const firstConnectedAt = connection.connectedAt;

      // First disconnection
      connection = connection.disconnect();
      expect(connection.isDisconnected).toBe(true);
      const firstDisconnectedAt = connection.disconnectedAt;

      // Second connection
      connection = connection.connect();
      expect(connection.isConnected).toBe(true);
      const secondConnectedAt = connection.connectedAt;

      // New connection timestamp is recorded (same or later)
      expect(secondConnectedAt!.getTime()).toBeGreaterThanOrEqual(firstConnectedAt!.getTime());

      // Second disconnection
      connection = connection.disconnect();
      expect(connection.isDisconnected).toBe(true);

      // New disconnection timestamp is recorded (same or later)
      expect(connection.disconnectedAt!.getTime()).toBeGreaterThanOrEqual(firstDisconnectedAt!.getTime());
    });
  });

  describe('Complex scenario: Recovery from error', () => {
    it('should handle error occurrence, reconnect, and success flow', () => {
      let connection = Connection.create({
        manufacturer: TargetManufacturer.sius(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      // Connection attempt
      connection = connection.connect();
      expect(connection.isConnected).toBe(true);

      // Error occurs
      connection = connection.setError('Timeout error');
      expect(connection.hasError).toBe(true);
      expect(connection.lastError).toBe('Timeout error');

      // Reconnection succeeds
      connection = connection.connect();
      expect(connection.isConnected).toBe(true);
      expect(connection.hasError).toBe(false);
      expect(connection.lastError).toBeNull();
    });
  });

  describe('Edge case: Connections with different baud rates', () => {
    it('should create connections with various standard baud rates', () => {
      const baudRates = [9600, 19200, 38400, 57600, 115200];

      baudRates.forEach((baudRate) => {
        const connection = Connection.create({
          manufacturer: TargetManufacturer.sius(),
          portPath: 'COM3',
          baudRate,
        });

        expect(connection.baudRate).toBe(baudRate);
      });
    });
  });
});

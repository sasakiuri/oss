// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';

describe('ConnectionStatus value object', () => {
  describe('Factory methods', () => {
    it('should create a disconnected status with ConnectionStatus.disconnected()', () => {
      const status = ConnectionStatus.disconnected();
      expect(status.value).toBe('DISCONNECTED');
      expect(status.displayName).toBe('Disconnected');
      expect(status.isConnected).toBe(false);
    });

    it('should create a connecting status with ConnectionStatus.connecting()', () => {
      const status = ConnectionStatus.connecting();
      expect(status.value).toBe('CONNECTING');
      expect(status.displayName).toBe('Connecting');
      expect(status.isConnected).toBe(false);
    });

    it('should create a connected status with ConnectionStatus.connected()', () => {
      const status = ConnectionStatus.connected();
      expect(status.value).toBe('CONNECTED');
      expect(status.displayName).toBe('Connected');
      expect(status.isConnected).toBe(true);
    });

    it('should create an error status with ConnectionStatus.error()', () => {
      const status = ConnectionStatus.error();
      expect(status.value).toBe('ERROR');
      expect(status.displayName).toBe('Error');
      expect(status.isConnected).toBe(false);
    });
  });

  describe('isConnected property', () => {
    it('should be false for disconnected status', () => {
      const status = ConnectionStatus.disconnected();
      expect(status.isConnected).toBe(false);
    });

    it('should be false for connecting status', () => {
      const status = ConnectionStatus.connecting();
      expect(status.isConnected).toBe(false);
    });

    it('should be true for connected status', () => {
      const status = ConnectionStatus.connected();
      expect(status.isConnected).toBe(true);
    });

    it('should be false for error status', () => {
      const status = ConnectionStatus.error();
      expect(status.isConnected).toBe(false);
    });
  });

  describe('equals() method', () => {
    it('should return true when comparing identical disconnected statuses', () => {
      const status1 = ConnectionStatus.disconnected();
      const status2 = ConnectionStatus.disconnected();
      expect(status1.equals(status2)).toBe(true);
    });

    it('should return false when comparing different statuses', () => {
      const status1 = ConnectionStatus.disconnected();
      const status2 = ConnectionStatus.connected();
      expect(status1.equals(status2)).toBe(false);
    });

    it('should return true when comparing with itself', () => {
      const status = ConnectionStatus.connected();
      expect(status.equals(status)).toBe(true);
    });
  });

  describe('Immutability', () => {
    it('should have read-only properties', () => {
      const status = ConnectionStatus.connected();
      expect(() => {
        (status as any).value = 'DISCONNECTED';
      }).toThrow();
    });
  });
});

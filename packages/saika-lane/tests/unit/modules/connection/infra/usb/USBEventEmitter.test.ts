// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { Connection } from '@/main/modules/connection/domain/Connection';
import { USBEventEmitter } from '@/main/modules/connection/infra/usb/USBEventEmitter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

describe('USBEventEmitter', () => {
  describe('on()', () => {
    it('should register an event listener and invoke it on emit', () => {
      const emitter = new USBEventEmitter();
      const callback = vi.fn();

      emitter.on('data', callback);
      emitter.emit('data', { x: 1, y: 2, timestamp: new Date() });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ x: 1, y: 2 }));
    });

    it('should register multiple listeners for the same event', () => {
      const emitter = new USBEventEmitter();
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      emitter.on('data', callback1);
      emitter.on('data', callback2);
      emitter.emit('data', { x: 1, y: 2, timestamp: new Date() });

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should handle different events independently', () => {
      const emitter = new USBEventEmitter();
      const dataCallback = vi.fn();
      const errorCallback = vi.fn();

      emitter.on('data', dataCallback);
      emitter.on('error', errorCallback);
      emitter.emit('data', { x: 1, y: 2, timestamp: new Date() });

      expect(dataCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).not.toHaveBeenCalled();
    });

    it('should unsubscribe the listener using the unsubscribe function', () => {
      const emitter = new USBEventEmitter();
      const callback = vi.fn();

      const unsubscribe = emitter.on('data', callback);
      unsubscribe();
      emitter.emit('data', { x: 1, y: 2, timestamp: new Date() });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should continue invoking listeners that are not unsubscribed', () => {
      const emitter = new USBEventEmitter();
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsubscribe1 = emitter.on('data', callback1);
      emitter.on('data', callback2);

      unsubscribe1();
      emitter.emit('data', { x: 1, y: 2, timestamp: new Date() });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('emit()', () => {
    it('should emit void events without arguments', () => {
      const emitter = new USBEventEmitter();
      const callback = vi.fn();

      emitter.on('disconnected', callback);
      emitter.emit('disconnected');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should pass a Connection entity with connected event', () => {
      const emitter = new USBEventEmitter();
      const callback = vi.fn();
      const connection = Connection.create({
        manufacturer: TargetManufacturer.custom(),
        portPath: 'COM3',
        baudRate: 9600,
      });

      emitter.on('connected', callback);
      emitter.emit('connected', connection.connect());

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ portPath: 'COM3' }));
    });

    it('should pass error information with error event', () => {
      const emitter = new USBEventEmitter();
      const callback = vi.fn();

      emitter.on('error', callback);
      emitter.emit('error', { error: new Error('test error'), recoverable: true });

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ recoverable: true }));
    });

    it('should pass attempt count with reconnectFailed event', () => {
      const emitter = new USBEventEmitter();
      const callback = vi.fn();

      emitter.on('reconnectFailed', callback);
      emitter.emit('reconnectFailed', { attempts: 3, lastError: new Error('failed') });

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ attempts: 3 }));
    });

    it('should not throw an error when emitting an event with no listeners', () => {
      const emitter = new USBEventEmitter();

      expect(() => {
        emitter.emit('data', { x: 0, y: 0, timestamp: new Date() });
      }).not.toThrow();
    });
  });
});

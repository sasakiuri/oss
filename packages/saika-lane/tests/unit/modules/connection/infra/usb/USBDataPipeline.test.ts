// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { USBConnectionConfig } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import { USBDataPipeline } from '@/main/modules/connection/infra/usb/USBDataPipeline';
import { USBEventEmitter } from '@/main/modules/connection/infra/usb/USBEventEmitter';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

// Mock Electron
vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

// Mock Logger
vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn().mockReturnValue(true),
  }),
}));

describe('USBDataPipeline', () => {
  let emitter: USBEventEmitter;
  let mockDataParser: { parse: ReturnType<typeof vi.fn>; clearBuffer: ReturnType<typeof vi.fn> };
  let mockConversionService: {
    convert: ReturnType<typeof vi.fn>;
    convertByDeviceId: ReturnType<typeof vi.fn>;
  };
  let pipeline: USBDataPipeline;
  let config: USBConnectionConfig;

  beforeEach(() => {
    emitter = new USBEventEmitter();
    mockDataParser = {
      parse: vi.fn().mockReturnValue([]),
      clearBuffer: vi.fn(),
    };
    mockConversionService = {
      convert: vi.fn(),
      convertByDeviceId: vi.fn(),
    };

    pipeline = new USBDataPipeline(mockDataParser as any, mockConversionService as any, emitter);
    pipeline.setSessionContextProvider(() => ({
      discipline: Discipline.beamRifle10m(),
      mode: Mode.sighting(),
    }));
    config = {
      portName: 'COM3',
      manufacturer: TargetManufacturer.custom(),
      baudRate: 9600,
    };
  });

  describe('onShotDetected callback', () => {
    it('should invoke callback on USB data reception', () => {
      const callback = vi.fn();
      pipeline.setOnShotDetected(callback);

      pipeline.processReceivedData(Buffer.from('test'), config);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should invoke callback before parsing', () => {
      const callOrder: string[] = [];
      pipeline.setOnShotDetected(() => callOrder.push('callback'));
      mockDataParser.parse.mockImplementation(() => {
        callOrder.push('parse');
        return [];
      });

      pipeline.processReceivedData(Buffer.from('test'), config);

      expect(callOrder).toEqual(['callback', 'parse']);
    });

    it('should not throw an error when no callback is set', () => {
      mockDataParser.parse.mockReturnValue([]);

      expect(() => pipeline.processReceivedData(Buffer.from('test'), config)).not.toThrow();
    });
  });

  describe('processReceivedData()', () => {
    it('should convert parse results to ShotData and emit a data event', () => {
      const rawData = {
        raw: Buffer.from('test'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };
      mockDataParser.parse.mockReturnValue([rawData]);
      mockConversionService.convert.mockReturnValue({
        impactPoint: new ImpactPoint(5.5, 3.2),
        score: new Score(98),
        timestamp: new Date('2026-01-01T00:00:00Z'),
        mode: Mode.match(),
      });

      const callback = vi.fn();
      emitter.on('data', callback);

      pipeline.processReceivedData(Buffer.from('test'), config);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ x: 5.5, y: 3.2, score: 98 }));
    });

    it('should use convertByDeviceId when deviceId is specified', () => {
      const configWithDevice: USBConnectionConfig = {
        ...config,
        deviceId: 'MT201',
      };
      const rawData = {
        raw: Buffer.from('test'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };
      mockDataParser.parse.mockReturnValue([rawData]);
      mockConversionService.convertByDeviceId.mockReturnValue({
        impactPoint: new ImpactPoint(1.0, 2.0),
        score: new Score(100),
        timestamp: new Date(),
        mode: Mode.match(),
      });

      pipeline.processReceivedData(Buffer.from('test'), configWithDevice);

      expect(mockConversionService.convertByDeviceId).toHaveBeenCalledWith(
        rawData,
        'MT201',
        expect.objectContaining({
          shotNumber: expect.any(Number),
          discipline: expect.anything(),
          mode: expect.anything(),
        }),
      );
      expect(mockConversionService.convert).not.toHaveBeenCalled();
    });

    it('should emit an error event on parse error (recoverable: true)', () => {
      mockDataParser.parse.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const errorCallback = vi.fn();
      emitter.on('error', errorCallback);

      pipeline.processReceivedData(Buffer.from('invalid'), config);

      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledWith(expect.objectContaining({ recoverable: true }));
    });

    it('should emit an error event on conversion error (recoverable: true)', () => {
      const rawData = {
        raw: Buffer.from('test'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };
      mockDataParser.parse.mockReturnValue([rawData]);
      mockConversionService.convert.mockImplementation(() => {
        throw new Error('Conversion error');
      });

      const errorCallback = vi.fn();
      emitter.on('error', errorCallback);

      pipeline.processReceivedData(Buffer.from('test'), config);

      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledWith(expect.objectContaining({ recoverable: true }));
    });

    it('should not emit a data event when parse results are empty', () => {
      mockDataParser.parse.mockReturnValue([]);

      const callback = vi.fn();
      emitter.on('data', callback);

      pipeline.processReceivedData(Buffer.from('empty'), config);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should process multiple parse results sequentially', () => {
      const rawData1 = {
        raw: Buffer.from('data1'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };
      const rawData2 = {
        raw: Buffer.from('data2'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };
      mockDataParser.parse.mockReturnValue([rawData1, rawData2]);
      mockConversionService.convert
        .mockReturnValueOnce({
          impactPoint: new ImpactPoint(1.0, 1.0),
          score: new Score(100),
          timestamp: new Date(),
          mode: Mode.match(),
        })
        .mockReturnValueOnce({
          impactPoint: new ImpactPoint(2.0, 2.0),
          score: new Score(90),
          timestamp: new Date(),
          mode: Mode.match(),
        });

      const callback = vi.fn();
      emitter.on('data', callback);

      pipeline.processReceivedData(Buffer.from('multi'), config);

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should emit an error event when session context provider is not set', () => {
      const pipelineNoCtx = new USBDataPipeline(mockDataParser as any, mockConversionService as any, emitter);
      const rawData = {
        raw: Buffer.from('test'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };
      mockDataParser.parse.mockReturnValue([rawData]);

      const errorCallback = vi.fn();
      emitter.on('error', errorCallback);

      pipelineNoCtx.processReceivedData(Buffer.from('test'), config);

      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledWith(expect.objectContaining({ recoverable: true }));
    });

    it('should emit an error event when context provider throws', () => {
      pipeline.setSessionContextProvider(() => {
        throw new Error('No active session');
      });
      const rawData = {
        raw: Buffer.from('test'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };
      mockDataParser.parse.mockReturnValue([rawData]);

      const errorCallback = vi.fn();
      emitter.on('error', errorCallback);

      pipeline.processReceivedData(Buffer.from('test'), config);

      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledWith(expect.objectContaining({ recoverable: true }));
    });
  });

  describe('resetCounter()', () => {
    it('should reset the shot number counter', () => {
      const rawData = {
        raw: Buffer.from('test'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };
      mockDataParser.parse.mockReturnValue([rawData]);
      mockConversionService.convert.mockReturnValue({
        impactPoint: new ImpactPoint(1.0, 2.0),
        score: new Score(100),
        timestamp: new Date(),
        mode: Mode.match(),
      });

      // Process 2 shots
      pipeline.processReceivedData(Buffer.from('shot1'), config);
      pipeline.processReceivedData(Buffer.from('shot2'), config);

      // Verify shotNumber incremented to 2
      const lastContext = mockConversionService.convert.mock.calls[1]![1];
      expect(lastContext.shotNumber).toBe(2);

      // Reset counter
      pipeline.resetCounter();

      // Process another shot
      pipeline.processReceivedData(Buffer.from('shot3'), config);

      // Should be 1 again after reset
      const resetContext = mockConversionService.convert.mock.calls[2]![1];
      expect(resetContext.shotNumber).toBe(1);
    });
  });

  describe('setSessionContextProvider()', () => {
    it('should pass the configured provider discipline/mode to the context', () => {
      pipeline.setSessionContextProvider(() => ({
        discipline: Discipline.airRifle10m(),
        mode: Mode.match(),
      }));

      const rawData = {
        raw: Buffer.from('test'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };
      mockDataParser.parse.mockReturnValue([rawData]);
      mockConversionService.convert.mockReturnValue({
        impactPoint: new ImpactPoint(1.0, 2.0),
        score: new Score(100),
        timestamp: new Date(),
        mode: Mode.match(),
      });

      pipeline.processReceivedData(Buffer.from('test'), config);

      const context = mockConversionService.convert.mock.calls[0]![1];
      expect(context.discipline.value).toBe('AIR_RIFLE_10M');
      expect(context.mode.value).toBe('MATCH');
    });
  });

  describe('detach()', () => {
    it('should remove listeners from an attached port', () => {
      const mockPort = {
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      };

      pipeline.attach(mockPort as any, config, vi.fn());

      pipeline.detach();

      expect(mockPort.removeAllListeners).toHaveBeenCalledWith('data');
      expect(mockPort.removeAllListeners).toHaveBeenCalledWith('readable');
      expect(mockPort.removeAllListeners).toHaveBeenCalledWith('close');
    });

    it('should not throw an error when called without an attached port', () => {
      expect(() => pipeline.detach()).not.toThrow();
    });

    it('should not throw an error when detaching again after detach', () => {
      const mockPort = {
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      };

      pipeline.attach(mockPort as any, config, vi.fn());
      pipeline.detach();
      pipeline.detach();

      // removeAllListeners is only called on the first detach
      expect(mockPort.removeAllListeners).toHaveBeenCalledTimes(3);
    });
  });

  describe('attach()', () => {
    it('should attach a data event listener to the port', () => {
      const mockPort = {
        on: vi.fn(),
      };

      pipeline.attach(mockPort as any, config, vi.fn());

      // Two listeners should be registered: data and close
      const eventNames = mockPort.on.mock.calls.map((call: unknown[]) => call[0]);
      expect(eventNames).toContain('data');
      expect(eventNames).toContain('close');
    });

    it('should invoke onClose callback on close event', () => {
      const mockPort = {
        on: vi.fn(),
      };
      const onClose = vi.fn();

      pipeline.attach(mockPort as any, config, onClose);

      // Get the close listener and invoke it
      const closeCall = mockPort.on.mock.calls.find((call: unknown[]) => call[0] === 'close');
      expect(closeCall).toBeDefined();

      const closeHandler = closeCall![1] as (...args: unknown[]) => void;
      closeHandler();

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should emit a disconnected event on close event', () => {
      const mockPort = {
        on: vi.fn(),
      };
      const disconnectedCallback = vi.fn();
      emitter.on('disconnected', disconnectedCallback);

      pipeline.attach(mockPort as any, config, vi.fn());

      // Get the close listener and invoke it
      const closeCall = mockPort.on.mock.calls.find((call: unknown[]) => call[0] === 'close');
      const closeHandler = closeCall![1] as (...args: unknown[]) => void;
      closeHandler();

      expect(disconnectedCallback).toHaveBeenCalledTimes(1);
    });

    it('should call processReceivedData on data event', () => {
      const mockPort = {
        on: vi.fn(),
      };
      const rawData = {
        raw: Buffer.from('test'),
        timestamp: new Date(),
        manufacturer: TargetManufacturer.custom(),
      };
      mockDataParser.parse.mockReturnValue([rawData]);
      mockConversionService.convert.mockReturnValue({
        impactPoint: new ImpactPoint(1.0, 2.0),
        score: new Score(100),
        timestamp: new Date(),
        mode: Mode.match(),
      });

      const dataCallback = vi.fn();
      emitter.on('data', dataCallback);

      pipeline.attach(mockPort as any, config, vi.fn());

      // Get the data listener and invoke it
      const dataCall = mockPort.on.mock.calls.find((call: unknown[]) => call[0] === 'data');
      const dataHandler = dataCall![1] as (...args: unknown[]) => void;
      dataHandler(Buffer.from('test'));

      expect(dataCallback).toHaveBeenCalledTimes(1);
    });
  });
});

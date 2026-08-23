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

  describe('processShotFrame()', () => {
    const redDotConfig: USBConnectionConfig = {
      portName: 'COM3',
      manufacturer: TargetManufacturer.disag(),
      deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE',
      baudRate: 9600,
    };

    it('bypasses the stream parser and converts by the exact RedDot device ID', () => {
      const frame = Buffer.alloc(59, 0x30);
      const receivedAt = new Date('2026-08-08T00:00:00.000Z');
      mockConversionService.convertByDeviceId.mockReturnValue({
        impactPoint: new ImpactPoint(3, 4),
        score: new Score(90),
        timestamp: receivedAt,
        mode: Mode.sighting(),
      });

      pipeline.processShotFrame(frame, receivedAt, redDotConfig);

      expect(mockDataParser.parse).not.toHaveBeenCalled();
      expect(mockConversionService.convertByDeviceId).toHaveBeenCalledWith(
        expect.objectContaining({
          raw: expect.any(Buffer),
          timestamp: receivedAt,
          manufacturer: redDotConfig.manufacturer,
        }),
        'DISAG_KT_RDT_ZIE_1_RIFLE',
        expect.objectContaining({ shotNumber: 1 }),
      );
      expect(mockConversionService.convert).not.toHaveBeenCalled();
    });

    it('accepts validated frames for the RedDot pistol profile', () => {
      const receivedAt = new Date('2026-08-08T00:00:00.000Z');
      const pistolConfig: USBConnectionConfig = {
        ...redDotConfig,
        deviceId: 'DISAG_KT_RDT_ZIE_1_PISTOL',
      };
      mockConversionService.convertByDeviceId.mockReturnValue({
        impactPoint: new ImpactPoint(3, 4),
        score: new Score(103),
        timestamp: receivedAt,
        mode: Mode.match(),
      });

      pipeline.processShotFrame(Buffer.alloc(59), receivedAt, pistolConfig);

      expect(mockConversionService.convertByDeviceId).toHaveBeenCalledWith(
        expect.any(Object),
        'DISAG_KT_RDT_ZIE_1_PISTOL',
        expect.any(Object),
      );
    });

    it('plays the shot notification once immediately before emitting data', () => {
      const callOrder: string[] = [];
      const receivedAt = new Date('2026-08-08T00:00:00.000Z');
      pipeline.setOnShotDetected(() => callOrder.push('sound'));
      emitter.on('data', () => callOrder.push('data'));
      mockConversionService.convertByDeviceId.mockReturnValue({
        impactPoint: new ImpactPoint(3, 4),
        score: new Score(90),
        timestamp: receivedAt,
        mode: Mode.sighting(),
      });

      pipeline.processShotFrame(Buffer.alloc(59), receivedAt, redDotConfig);

      expect(callOrder).toEqual(['sound', 'data']);
    });

    it('does not play a shot notification or emit data when conversion fails', () => {
      const sound = vi.fn();
      const data = vi.fn();
      const error = vi.fn();
      pipeline.setOnShotDetected(sound);
      emitter.on('data', data);
      emitter.on('error', error);
      mockConversionService.convertByDeviceId.mockImplementation(() => {
        throw new Error('invalid frame');
      });

      pipeline.processShotFrame(Buffer.alloc(59), new Date(), redDotConfig);

      expect(sound).not.toHaveBeenCalled();
      expect(data).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ recoverable: true }));
    });
  });

  describe('protocol-independent shot frames', () => {
    const bpt216Config: USBConnectionConfig = {
      portName: 'COM3',
      manufacturer: TargetManufacturer.kohto(),
      deviceId: 'BPT216',
      baudRate: 115200,
    };

    it('bypasses the generic stream parser and converts by the exact device ID', () => {
      const frame = Buffer.from('10.90,123,-456,0,0,T');
      const receivedAt = new Date('2026-08-14T00:00:00.000Z');
      mockConversionService.convertByDeviceId.mockReturnValue({
        impactPoint: new ImpactPoint(1.23, -4.56),
        score: new Score(109),
        timestamp: receivedAt,
        mode: Mode.match(),
      });

      pipeline.processShotFrame(frame, receivedAt, bpt216Config);

      expect(mockDataParser.parse).not.toHaveBeenCalled();
      expect(mockConversionService.convertByDeviceId).toHaveBeenCalledWith(
        expect.objectContaining({ raw: frame, timestamp: receivedAt, manufacturer: bpt216Config.manufacturer }),
        'BPT216',
        expect.objectContaining({ shotNumber: 1 }),
      );
    });

    it('notifies only after successful conversion and does not consume a shot number on failure', () => {
      const callOrder: string[] = [];
      const error = vi.fn();
      const receivedAt = new Date('2026-08-14T00:00:00.000Z');
      pipeline.setOnShotDetected(() => callOrder.push('sound'));
      emitter.on('data', () => callOrder.push('data'));
      emitter.on('error', error);
      mockConversionService.convertByDeviceId
        .mockImplementationOnce(() => {
          throw new Error('invalid terminal frame');
        })
        .mockReturnValueOnce({
          impactPoint: new ImpactPoint(1.23, -4.56),
          score: new Score(109),
          timestamp: receivedAt,
          mode: Mode.match(),
        });

      pipeline.processShotFrame(Buffer.from('bad,T'), receivedAt, bpt216Config);
      pipeline.processShotFrame(Buffer.from('10.90,123,-456,0,0,T'), receivedAt, bpt216Config);

      expect(callOrder).toEqual(['sound', 'data']);
      expect(error).toHaveBeenCalledTimes(1);
      expect(mockConversionService.convertByDeviceId.mock.calls[1]?.[2]).toMatchObject({ shotNumber: 1 });
    });

    it('routes canonical and legacy BPT-216 IDs without device-specific pipeline branches', () => {
      const receivedAt = new Date('2026-08-14T00:00:00.000Z');
      mockConversionService.convertByDeviceId.mockReturnValue({
        impactPoint: new ImpactPoint(0, 0),
        score: new Score(109),
        timestamp: receivedAt,
        mode: Mode.match(),
      });

      pipeline.processShotFrame(Buffer.from('10.90,0,0,0,0,T'), receivedAt, bpt216Config);
      pipeline.processShotFrame(Buffer.from('10.90,0,0,0,0,T'), receivedAt, {
        ...bpt216Config,
        deviceId: 'BP216',
      });

      expect(mockConversionService.convertByDeviceId).toHaveBeenCalledTimes(2);
      expect(mockConversionService.convertByDeviceId.mock.calls.map((call) => call[1])).toEqual(['BPT216', 'BP216']);
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

  describe('clearBufferedData()', () => {
    it('should discard partial direct-stream data at a connection boundary', () => {
      pipeline.clearBufferedData();

      expect(mockDataParser.clearBuffer).toHaveBeenCalledTimes(1);
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
});

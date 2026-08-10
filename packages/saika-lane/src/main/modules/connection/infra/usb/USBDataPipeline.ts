// SPDX-License-Identifier: MIT
import { app } from 'electron';
import type { SerialPort } from 'serialport';

import type { AdapterContext } from '@/main/modules/target/adapters/AdapterContext';
import { DISAG_RED_DOT_RIFLE_DEVICE_ID } from '@/main/modules/target/domain/targetDeviceDefinitions';
import { DataConversionService } from '@/main/modules/target/infra/DataConversionService';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { SerialDataParser } from '@/main/modules/target/infra/SerialDataParser';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { toError } from '@/shared/errors/toError';

import type { ShotData, USBConnectionConfig } from './IUSBConnectionManager';
import type { USBEventEmitter } from './USBEventEmitter';

/**
 * Type for the session context provider
 *
 * Synchronously returns the discipline/mode of the current session.
 * Throws if no session has been started.
 */
export type SessionContextProvider = () => Pick<AdapterContext, 'discipline' | 'mode'>;

/**
 * USBDataPipeline
 *
 * Parse and conversion pipeline for data received via USB.
 * Receives binary data from the serial port,
 * parses it with SerialDataParser, then converts it to ShotData via DataConversionService.
 */
export class USBDataPipeline {
  readonly dataParser: SerialDataParser;
  readonly dataConversionService: DataConversionService;
  private shotNumberCounter = 0;
  private sessionContextProvider: SessionContextProvider | null = null;
  private onShotDetected: (() => void) | null = null;
  private attachedPort: SerialPort | null = null;

  constructor(
    dataParser: SerialDataParser,
    dataConversionService: DataConversionService,
    private readonly emitter: USBEventEmitter,
  ) {
    this.dataParser = dataParser;
    this.dataConversionService = dataConversionService;
  }

  /**
   * Set the session context provider
   *
   * @param provider - Callback that returns discipline/mode
   */
  setSessionContextProvider(provider: SessionContextProvider): void {
    this.sessionContextProvider = provider;
  }

  /**
   * Set the callback invoked when a shot is detected.
   * Direct-stream devices call it on reception; framed protocols call it only
   * after successful validation and conversion.
   */
  setOnShotDetected(callback: () => void): void {
    this.onShotDetected = callback;
  }

  /**
   * Reset the shot number counter
   */
  resetCounter(): void {
    this.shotNumberCounter = 0;
  }

  /**
   * Detach data listeners from the SerialPort
   */
  detach(): void {
    if (this.attachedPort) {
      this.attachedPort.removeAllListeners('data');
      this.attachedPort.removeAllListeners('readable');
      this.attachedPort = null;
    }
  }

  /**
   * Attach data listeners to the SerialPort
   *
   * @param port - SerialPort instance
   * @param config - USB connection settings
   */
  attach(port: SerialPort, config: USBConnectionConfig): void {
    this.attachedPort = port;
    const logger = getLogger();
    logger.debug('[USB] setupDataListener() called', 'usb', {
      portExists: !!port,
    });

    // Toggle readable mode via environment variable (for debugging)
    const useReadableMode = !app.isPackaged && process.env.USE_READABLE_MODE === 'true';
    logger.debug('[USB] Event mode: ' + (useReadableMode ? 'readable' : 'data'), 'usb');

    if (useReadableMode) {
      // readable mode: manually call port.read() (avoids flowing mode)
      port.on('readable', () => {
        logger.debug('[USB] readable event fired - attempting to read', 'usb');

        let chunk: Buffer | null;
        while ((chunk = port.read()) !== null) {
          if (logger.isLevelEnabled('debug')) {
            logger.debug('[USB] read() returned chunk', 'usb', {
              chunkLength: chunk.length,
              chunkHexPreview: chunk.slice(0, 32).toString('hex'),
            });
          }

          this.processReceivedData(chunk, config);
        }
      });

      logger.debug('[USB] Readable event listener attached', 'usb');
    } else {
      // data mode: automatically enters flowing mode (default)
      port.on('data', (chunk: Buffer) => {
        if (logger.isLevelEnabled('debug')) {
          logger.debug('[USB] data event received', 'usb', {
            chunkLength: chunk.length,
            chunkHexPreview: chunk.slice(0, 32).toString('hex'),
          });
        }

        this.processReceivedData(chunk, config);
      });

      logger.debug('[USB] Data event listener attached', 'usb');
    }
  }

  /**
   * Process received data
   *
   * Parses binary data, converts it to ShotData, and emits the event.
   *
   * @param chunk - Received binary data
   * @param config - USB connection settings
   */
  processReceivedData(chunk: Buffer, config: USBConnectionConfig): void {
    // Notify immediately after USB reception (for fastest impact sound playback) — fired before logging or parsing
    try {
      this.onShotDetected?.();
    } catch {
      /* non-critical: sound notification failure must not block data processing */
    }

    try {
      // Log chunk reception
      const logger = getLogger();
      if (logger.isLevelEnabled('debug')) {
        logger.debug('[USB] Raw chunk received', 'usb', {
          chunkLength: chunk.length,
          chunkHex: chunk.toString('hex'),
          chunkUtf8: chunk.toString('utf-8').replace(/\r?\n/g, '\\n'),
        });
      }

      // Parse the data
      const rawDataList = this.dataParser.parse(chunk, config.manufacturer);

      // Convert parse results to ShotData and emit
      rawDataList.forEach((rawData) => {
        this.convertAndEmit(rawData, config, false);
      });
    } catch (error) {
      const logger = getLogger();
      logger.error(
        'Data parse error',
        'usb',
        error instanceof Error ? { error: error.stack } : { error: String(error) },
      );
      this.emitter.emit('error', { error: toError(error), recoverable: true });
    }
  }

  /**
   * Processes one frame already validated and delimited by a protocol session.
   * This bypasses SerialDataParser so protocol bytes and partial frames cannot
   * trigger shot notifications.
   */
  processValidatedFrame(frame: Buffer, receivedAt: Date, config: USBConnectionConfig): void {
    try {
      if (config.deviceId !== DISAG_RED_DOT_RIFLE_DEVICE_ID) {
        throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
          reason: 'Validated RedDot frames require the RedDot Rifle device ID',
          deviceId: config.deviceId,
        });
      }

      const rawData: RawData = Object.freeze({
        raw: Buffer.from(frame),
        timestamp: new Date(receivedAt.getTime()),
        manufacturer: config.manufacturer,
      });
      this.convertAndEmit(rawData, config, true);
    } catch (error) {
      getLogger().error(
        'Validated frame processing error',
        'usb',
        error instanceof Error ? { error: error.stack } : { error: String(error) },
      );
      this.emitter.emit('error', { error: toError(error), recoverable: true });
    }
  }

  private convertAndEmit(rawData: RawData, config: USBConnectionConfig, notifyBeforeEmit: boolean): void {
    const logger = getLogger();

    try {
      if (!this.sessionContextProvider) {
        throw ErrorCatalog.createError('SESSION_NOT_FOUND');
      }

      const { discipline, mode } = this.sessionContextProvider();
      this.shotNumberCounter++;
      const context: AdapterContext = {
        shotNumber: this.shotNumberCounter,
        discipline,
        mode,
      };

      const deviceId = config.deviceId;
      const shot = deviceId
        ? this.dataConversionService.convertByDeviceId(rawData, deviceId, context)
        : this.dataConversionService.convert(rawData, context);

      const shotData: ShotData = {
        x: shot.impactPoint !== null ? shot.impactPoint.x : null,
        y: shot.impactPoint !== null ? shot.impactPoint.y : null,
        timestamp: shot.timestamp,
        score: shot.score.value,
        mode: shot.mode.value,
        raw: rawData.raw,
      };

      logger.debug(
        '[USB] ShotData created',
        'usb',
        notifyBeforeEmit
          ? { rawLength: shotData.raw?.length ?? 0 }
          : {
              x: shotData.x,
              y: shotData.y,
              score: shotData.score,
              timestamp: shotData.timestamp.toISOString(),
              rawLength: shotData.raw?.length ?? 0,
            },
      );

      if (notifyBeforeEmit) {
        this.notifyShotDetected();
      }
      this.emitter.emit('data', shotData);
    } catch (conversionError) {
      logger.error(
        'Shot conversion error',
        'usb',
        conversionError instanceof Error ? { error: conversionError.stack } : { error: String(conversionError) },
      );
      this.emitter.emit('error', { error: toError(conversionError), recoverable: true });
    }
  }

  private notifyShotDetected(): void {
    try {
      this.onShotDetected?.();
    } catch {
      /* non-critical: sound notification failure must not block data processing */
    }
  }
}

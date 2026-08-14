// SPDX-License-Identifier: MIT
import type { AdapterContext } from '@/main/modules/target/adapters/AdapterContext';
import { DataConversionService } from '@/main/modules/target/infra/DataConversionService';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { SerialDataParser } from '@/main/modules/target/infra/SerialDataParser';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { toError } from '@/shared/errors/toError';

import type { SessionContextProvider, ShotData, USBConnectionConfig } from './IUSBConnectionManager';
import type { USBEventEmitter } from './USBEventEmitter';

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
   * Processes one shot frame already delimited by a target protocol.
   * This bypasses SerialDataParser so control bytes and partial frames cannot
   * trigger shot notifications or manufacturer stream parsing.
   */
  processShotFrame(frame: Buffer, receivedAt: Date, config: USBConnectionConfig): void {
    try {
      const rawData: RawData = Object.freeze({
        raw: Buffer.from(frame),
        timestamp: new Date(receivedAt.getTime()),
        manufacturer: config.manufacturer,
      });
      this.convertAndEmit(rawData, config, true);
    } catch (error) {
      getLogger().error(
        'Protocol shot frame processing error',
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
      const shotNumber = this.shotNumberCounter + 1;
      const context: AdapterContext = {
        shotNumber,
        discipline,
        mode,
      };

      const deviceId = config.deviceId;
      const shot = deviceId
        ? this.dataConversionService.convertByDeviceId(rawData, deviceId, context)
        : this.dataConversionService.convert(rawData, context);
      this.shotNumberCounter = shotNumber;

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

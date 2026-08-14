// SPDX-License-Identifier: MIT
import type { SerialPort } from 'serialport';

import type { Mode } from '@/main/modules/session/domain/Mode';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

/** Sends the MT-201-compatible, unterminated S/R mode command. */
export function writeModeCommand(port: SerialPort, mode: Mode, protocolId: string): Promise<void> {
  const logger = getLogger();
  const byte = mode.isSighting() ? 'S' : 'R';

  if (!port.isOpen) {
    logger.warn('[USB] sendMode: port is not open, skipping', 'usb', {
      protocolId,
      mode: mode.value,
      byte,
    });
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    try {
      port.write(Buffer.from(byte), (error) => {
        if (error) {
          logger.warn('[USB] sendMode: write failed', 'usb', {
            protocolId,
            mode: mode.value,
            byte,
            error: error.message,
          });
        }
        resolve();
      });
    } catch (error) {
      logger.warn('[USB] sendMode: write threw, skipping', 'usb', {
        protocolId,
        mode: mode.value,
        byte,
        error: error instanceof Error ? error.message : String(error),
      });
      resolve();
    }
  });
}

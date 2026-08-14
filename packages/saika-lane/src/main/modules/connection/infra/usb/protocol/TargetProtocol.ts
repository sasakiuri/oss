// SPDX-License-Identifier: MIT
import type { SerialPort } from 'serialport';

import type { Mode } from '@/main/modules/session/domain/Mode';

import type { SessionContextProvider, USBConnectionConfig } from '../IUSBConnectionManager';

/** Data callbacks exposed by the hardware-independent USB data pipeline. */
export interface TargetProtocolHandlers {
  readonly onStreamData: (chunk: Buffer) => void;
  readonly onShotFrame: (frame: Buffer, receivedAt: Date) => void;
  readonly onConnectionError: (error: Error) => void;
}

/** One protocol session bound to one open serial port. */
export interface TargetProtocolSession {
  start(): Promise<void>;
  stop(): void;
  sendMode(mode: Mode): Promise<void>;
}

/**
 * Hardware boundary for an electronic target protocol.
 *
 * Implementations own device-specific port setup, framing, handshakes, and
 * outbound commands. USBConnectionManager only coordinates their lifecycle.
 */
export interface TargetProtocol {
  readonly id: string;

  matches(config: USBConnectionConfig): boolean;

  /** Validates identity and active-session constraints before opening a port. */
  validate(config: USBConnectionConfig, sessionContextProvider: SessionContextProvider | null): void;

  createSession(
    port: SerialPort,
    config: USBConnectionConfig,
    getSessionContextProvider: () => SessionContextProvider | null,
    handlers: TargetProtocolHandlers,
  ): TargetProtocolSession;
}

// SPDX-License-Identifier: MIT
/**
 * USB connection management custom hook
 *
 * @description
 * Custom hook that manages connection and disconnection to USB target devices.
 * - Retrieve connection status
 * - Connection actions (connect / disconnect)
 * - Event subscription (connectionStatusChanged)
 * - Loading state management
 * - Error handling
 *
 * @example
 * ```tsx
 * function TargetControl() {
 *   const {
 *     status,
 *     connectionId,
 *     connect,
 *     disconnect,
 *     isConnecting,
 *     error
 *   } = useConnection();
 *
 *   if (status === 'disconnected') {
 *     return (
 *       <button
 *         onClick={() => connect('/dev/ttyUSB0', 'SIUS')}
 *         disabled={isConnecting}
 *       >
 *         Connect
 *       </button>
 *     );
 *   }
 *
 *   return <button onClick={disconnect}>Disconnect</button>;
 * }
 * ```
 */

import { useCallback } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { useConnectionStore } from '@/renderer/presentation/stores/connectionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { connectionService } from '@/renderer/services/connectionService';
import { ServiceError } from '@/renderer/services/createServiceMethod';
import type { ConnectionStatus, TargetManufacturer } from '@/shared/ipc/contracts';

/**
 * Return type of the useConnection hook
 */
export interface UseConnectionResult {
  /** Connection status */
  status: ConnectionStatus;
  /** Connection ID (null when disconnected) */
  connectionId: string | null;
  /** Serial port name (null when disconnected) */
  portName: string | null;
  /** Target manufacturer name (null when disconnected) */
  manufacturer: TargetManufacturer | null;
  /** Connect action */
  connect: (portName: string, manufacturer: TargetManufacturer, deviceId?: string, baudRate?: number) => Promise<void>;
  /** Disconnect action */
  disconnect: () => Promise<void>;
  /** Connection in-progress flag */
  isConnecting: boolean;
  /** Disconnection in-progress flag */
  isDisconnecting: boolean;
  /** Error message (null when no error) */
  error: string | null;
  /** Clear error action */
  clearError: () => void;
}

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ServiceError) return err.message;
  return fallback;
}

/**
 * USB connection management custom hook
 *
 * @returns Connection state and actions
 */
export function useConnection(): UseConnectionResult {
  const {
    status,
    connectionId,
    portName,
    manufacturer,
    setConnection,
    disconnect: disconnectStore,
  } = useConnectionStore();

  const { setDeviceInfo } = useSessionStore();

  const connecting = useAsyncAction(
    async (port: string, mfr: TargetManufacturer, deviceId?: string, baudRate?: number) => {
      const result = await connectionService.connect({
        portName: port,
        manufacturer: mfr,
        deviceId,
        baudRate,
      });
      setConnection(result.connectionId, port, mfr, deviceId);
      setDeviceInfo(mfr, deviceId ?? null);
    },
    { errorMessage: 'An error occurred while connecting' },
  );

  const disconnecting = useAsyncAction(
    async () => {
      if (!connectionId) return;
      await connectionService.disconnect({ connectionId });
      disconnectStore();
    },
    { errorMessage: 'An error occurred while disconnecting' },
  );

  // useConnection has traditionally swallowed errors (no re-throw)
  const connect = useCallback(
    async (port: string, mfr: TargetManufacturer, deviceId?: string, baudRate?: number) => {
      disconnecting.clearError();
      try {
        await connecting.execute(port, mfr, deviceId, baudRate);
      } catch {
        // Error is already stored in connecting.error
      }
    },
    [connecting.execute, disconnecting.clearError],
  );

  const disconnect = useCallback(async () => {
    connecting.clearError();
    try {
      await disconnecting.execute();
    } catch {
      // Error is already stored in disconnecting.error
    }
  }, [disconnecting.execute, connecting.clearError]);

  const clearError = useCallback(() => {
    connecting.clearError();
    disconnecting.clearError();
  }, [connecting.clearError, disconnecting.clearError]);

  const error = connecting.error
    ? toErrorMessage(connecting.error, 'An error occurred while connecting')
    : disconnecting.error
      ? toErrorMessage(disconnecting.error, 'An error occurred while disconnecting')
      : null;

  return {
    status,
    connectionId,
    portName,
    manufacturer,
    connect,
    disconnect,
    isConnecting: connecting.loading,
    isDisconnecting: disconnecting.loading,
    error,
    clearError,
  };
}

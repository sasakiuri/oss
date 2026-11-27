// SPDX-License-Identifier: MIT
/** Manages target connection commands and subscribes to connection status changes. */

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
  /** Connect action; resolves `false` when the connection failed (the error is in `error`). */
  connect: (
    portName: string,
    manufacturer: TargetManufacturer,
    deviceId?: string,
    baudRate?: number,
  ) => Promise<boolean>;
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

export function useConnection(): UseConnectionResult {
  const status = useConnectionStore((state) => state.status);
  const connectionId = useConnectionStore((state) => state.connectionId);
  const setConnection = useConnectionStore((state) => state.setConnection);
  const disconnectStore = useConnectionStore((state) => state.disconnect);
  const setDeviceId = useSessionStore((state) => state.setDeviceId);

  const connecting = useAsyncAction(
    async (port: string, mfr: TargetManufacturer, deviceId?: string, baudRate?: number) => {
      const result = await connectionService.connect({
        portName: port,
        manufacturer: mfr,
        deviceId,
        baudRate,
      });
      setConnection(result.connectionId, deviceId);
      setDeviceId(deviceId ?? null);
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

  // useConnection reports failures through `error` instead of re-throwing
  const connect = useCallback(
    async (port: string, mfr: TargetManufacturer, deviceId?: string, baudRate?: number) => {
      disconnecting.clearError();
      try {
        await connecting.execute(port, mfr, deviceId, baudRate);
        return true;
      } catch {
        // Error is already stored in connecting.error
        return false;
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
    connect,
    disconnect,
    isConnecting: connecting.loading,
    isDisconnecting: disconnecting.loading,
    error,
    clearError,
  };
}

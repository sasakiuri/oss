// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnection } from '@/renderer/presentation/hooks/useConnection';
import { useConnectionStore } from '@/renderer/presentation/stores/connectionStore';
import { connectionService } from '@/renderer/services/connectionService';
import { ServiceError } from '@/renderer/services/createServiceMethod';

// Mock service modules
vi.mock('@/renderer/services/connectionService', () => ({
  connectionService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    listPorts: vi.fn(),
    getDevicesByManufacturer: vi.fn(),
  },
}));

const mockConnect = vi.mocked(connectionService.connect);
const mockDisconnect = vi.mocked(connectionService.disconnect);

describe('useConnection', () => {
  beforeEach(() => {
    const { disconnect } = useConnectionStore.getState();
    disconnect();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('initializes in disconnected state', () => {
      const { result } = renderHook(() => useConnection());

      expect(result.current.status).toBe('disconnected');
      expect(result.current.connectionId).toBeNull();
      expect(result.current.portName).toBeNull();
      expect(result.current.manufacturer).toBeNull();
    });

    it('loading state is false', () => {
      const { result } = renderHook(() => useConnection());

      expect(result.current.isConnecting).toBe(false);
      expect(result.current.isDisconnecting).toBe(false);
    });

    it('error state is null', () => {
      const { result } = renderHook(() => useConnection());

      expect(result.current.error).toBeNull();
    });
  });

  describe('connect', () => {
    it('succeeds in connecting', async () => {
      // Service returns unwrapped data directly
      mockConnect.mockResolvedValue({ connectionId: 'conn-123' });

      const { result } = renderHook(() => useConnection());

      await act(async () => {
        await result.current.connect('/dev/ttyUSB0', 'SIUS');
      });

      expect(mockConnect).toHaveBeenCalledWith({
        portName: '/dev/ttyUSB0',
        manufacturer: 'SIUS',
      });

      expect(result.current.isConnecting).toBe(false);
      expect(result.current.error).toBeNull();

      // Verify store is updated
      const storeState = useConnectionStore.getState();
      expect(storeState.connectionId).toBe('conn-123');
      expect(storeState.portName).toBe('/dev/ttyUSB0');
      expect(storeState.manufacturer).toBe('SIUS');
      expect(storeState.status).toBe('connected');
    });

    it('isConnecting is true while connecting', async () => {
      let resolveConnect: (value: { connectionId: string }) => void;
      const connectPromise = new Promise<{ connectionId: string }>((resolve) => {
        resolveConnect = resolve;
      });

      mockConnect.mockReturnValue(connectPromise);

      const { result } = renderHook(() => useConnection());

      act(() => {
        result.current.connect('/dev/ttyUSB0', 'SIUS');
      });

      expect(result.current.isConnecting).toBe(true);

      await act(async () => {
        resolveConnect!({ connectionId: 'conn-123' });
        await connectPromise;
      });

      expect(result.current.isConnecting).toBe(false);
    });

    it('sets error state on connection error (ServiceError)', async () => {
      // Service throws ServiceError on failure
      mockConnect.mockRejectedValue(new ServiceError('Failed to connect to USB device', 'USB_CONNECT_FAILED'));

      const { result } = renderHook(() => useConnection());

      await act(async () => {
        await result.current.connect('/dev/ttyUSB0', 'SIUS');
      });

      expect(result.current.error).toBe('Failed to connect to USB device');
      expect(result.current.isConnecting).toBe(false);

      // Verify store is not updated
      const storeState = useConnectionStore.getState();
      expect(storeState.connectionId).toBeNull();
      expect(storeState.status).toBe('disconnected');
    });

    it('catches exceptions during connection and sets error state', async () => {
      mockConnect.mockRejectedValue(new Error('Unexpected error'));

      const { result } = renderHook(() => useConnection());

      await act(async () => {
        await result.current.connect('/dev/ttyUSB0', 'SIUS');
      });

      expect(result.current.error).toBe('An error occurred while connecting');
      expect(result.current.isConnecting).toBe(false);
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      // Set up connected state before each test
      mockConnect.mockResolvedValue({ connectionId: 'conn-123' });

      const { result } = renderHook(() => useConnection());
      await act(async () => {
        await result.current.connect('/dev/ttyUSB0', 'SIUS');
      });
    });

    it('succeeds in disconnecting', async () => {
      // Service returns void (undefined) on success
      mockDisconnect.mockResolvedValue(undefined);

      const { result } = renderHook(() => useConnection());

      await act(async () => {
        await result.current.disconnect();
      });

      expect(mockDisconnect).toHaveBeenCalledWith({
        connectionId: 'conn-123',
      });

      expect(result.current.isDisconnecting).toBe(false);
      expect(result.current.error).toBeNull();

      // Verify store is reset
      const storeState = useConnectionStore.getState();
      expect(storeState.connectionId).toBeNull();
      expect(storeState.portName).toBeNull();
      expect(storeState.manufacturer).toBeNull();
      expect(storeState.status).toBe('disconnected');
    });

    it('isDisconnecting is true while disconnecting', async () => {
      let resolveDisconnect: (value: void) => void;
      const disconnectPromise = new Promise<void>((resolve) => {
        resolveDisconnect = resolve;
      });

      mockDisconnect.mockReturnValue(disconnectPromise);

      const { result } = renderHook(() => useConnection());

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.isDisconnecting).toBe(true);

      await act(async () => {
        resolveDisconnect!(undefined);
        await disconnectPromise;
      });

      expect(result.current.isDisconnecting).toBe(false);
    });

    it('sets error state on disconnection error', async () => {
      mockDisconnect.mockRejectedValue(
        new ServiceError('Failed to disconnect from USB device', 'USB_DISCONNECT_FAILED'),
      );

      const { result } = renderHook(() => useConnection());

      await act(async () => {
        await result.current.disconnect();
      });

      expect(result.current.error).toBe('Failed to disconnect from USB device');
      expect(result.current.isDisconnecting).toBe(false);

      // Verify store is not changed
      const storeState = useConnectionStore.getState();
      expect(storeState.connectionId).toBe('conn-123');
      expect(storeState.status).toBe('connected');
    });

    it('catches exceptions during disconnection and sets error state', async () => {
      mockDisconnect.mockRejectedValue(new Error('Unexpected error'));

      const { result } = renderHook(() => useConnection());

      await act(async () => {
        await result.current.disconnect();
      });

      expect(result.current.error).toBe('An error occurred while disconnecting');
      expect(result.current.isDisconnecting).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('full scenario: connect → disconnect works correctly', async () => {
      mockConnect.mockResolvedValue({ connectionId: 'conn-789' });
      mockDisconnect.mockResolvedValue(undefined);

      const { result } = renderHook(() => useConnection());

      // Verify initial state
      expect(result.current.status).toBe('disconnected');

      // Connect
      await act(async () => {
        await result.current.connect('/dev/ttyUSB0', 'DISAG');
      });

      expect(result.current.status).toBe('connected');
      expect(result.current.connectionId).toBe('conn-789');
      expect(result.current.portName).toBe('/dev/ttyUSB0');
      expect(result.current.manufacturer).toBe('DISAG');

      // Disconnect
      await act(async () => {
        await result.current.disconnect();
      });

      expect(result.current.status).toBe('disconnected');
      expect(result.current.connectionId).toBeNull();
      expect(result.current.portName).toBeNull();
      expect(result.current.manufacturer).toBeNull();
    });

    it('can reconnect after an error', async () => {
      mockConnect
        .mockRejectedValueOnce(new ServiceError('Connection failed', 'USB_CONNECT_FAILED'))
        .mockResolvedValueOnce({ connectionId: 'conn-retry' });

      const { result } = renderHook(() => useConnection());

      // First connection fails
      await act(async () => {
        await result.current.connect('/dev/ttyUSB0', 'SIUS');
      });

      expect(result.current.error).toBe('Connection failed');
      expect(result.current.status).toBe('disconnected');

      // Reconnect succeeds
      await act(async () => {
        await result.current.connect('/dev/ttyUSB0', 'SIUS');
      });

      expect(result.current.error).toBeNull();
      expect(result.current.status).toBe('connected');
      expect(result.current.connectionId).toBe('conn-retry');
    });
  });
});

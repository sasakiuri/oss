// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsConnectionTab } from '@/renderer/presentation/components/settings/SettingsConnectionTab';
import type { UseConnectionResult } from '@/renderer/presentation/hooks/useConnection';
import { useConnection } from '@/renderer/presentation/hooks/useConnection';
import { useDeviceList } from '@/renderer/presentation/hooks/useDeviceList';
import { usePortList } from '@/renderer/presentation/hooks/usePortList';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { settingsService } from '@/renderer/services/settingsService';
import type { TargetDeviceDto, TargetManufacturer } from '@/shared/ipc/contracts';

// ============================================================
// Mocks
// ============================================================

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockClearError = vi.fn();

const defaultConnectionResult: UseConnectionResult = {
  status: 'disconnected',
  connectionId: null,
  portName: null,
  manufacturer: null,
  connect: mockConnect,
  disconnect: mockDisconnect,
  isConnecting: false,
  isDisconnecting: false,
  error: null,
  clearError: mockClearError,
};

vi.mock('@/renderer/presentation/hooks/useConnection', () => ({
  useConnection: vi.fn(() => defaultConnectionResult),
}));

const mockRefreshPorts = vi.fn();
const defaultPortListResult: ReturnType<typeof usePortList> = {
  ports: [
    { path: '/dev/ttyUSB0', manufacturer: 'FTDI', serialNumber: 'ABC123', vendorId: '0403', productId: '6001' },
    { path: '/dev/ttyUSB1', manufacturer: 'FTDI', serialNumber: 'DEF456', vendorId: '0403', productId: '6001' },
  ],
  portOptions: [
    { value: '/dev/ttyUSB0', label: '/dev/ttyUSB0 (FTDI)' },
    { value: '/dev/ttyUSB1', label: '/dev/ttyUSB1' },
  ],
  isLoadingPorts: false,
  portError: null,
  refreshPorts: mockRefreshPorts,
};

vi.mock('@/renderer/presentation/hooks/usePortList', () => ({
  usePortList: vi.fn(() => defaultPortListResult),
}));

const mockSetSelectedDeviceId = vi.fn();
const mockFetchDevices = vi.fn();
const mockSetDiscipline = vi.fn();

const defaultDeviceListResult = {
  deviceOptions: [
    {
      id: 'MT201',
      manufacturer: 'KOHTO' as TargetManufacturer,
      displayName: 'MT201',
      baudRate: 9600,
      supportedDisciplines: ['AIR_RIFLE_10M'],
    },
  ] as TargetDeviceDto[],
  selectedDeviceId: '',
  setSelectedDeviceId: mockSetSelectedDeviceId,
  isLoadingDevices: false,
  deviceError: null,
  fetchDevices: mockFetchDevices,
  setDiscipline: mockSetDiscipline,
};

vi.mock('@/renderer/presentation/hooks/useDeviceList', () => ({
  useDeviceList: vi.fn(() => defaultDeviceListResult),
}));

vi.mock('@/renderer/services/settingsService', () => ({
  settingsService: {
    saveConnectionSettings: vi.fn().mockResolvedValue(undefined),
    getConnectionSettings: vi.fn(() => new Promise<never>(() => {})),
    saveUserPreferences: vi.fn().mockResolvedValue(undefined),
    getUserPreferences: vi.fn().mockResolvedValue({ laneNumber: 1 }),
  },
}));

vi.mock('@/renderer/presentation/stores/sessionStore', async () => {
  const actual = await vi.importActual<typeof import('@/renderer/presentation/stores/sessionStore')>(
    '@/renderer/presentation/stores/sessionStore',
  );
  return { ...actual, useSessionStore: actual.useSessionStore };
});

// Mock PortSelector and DeviceSelector as simple divs
vi.mock('@/renderer/presentation/components/PortSelector', () => ({
  PortSelector: (props: { selectedPort: string; onPortChange: (v: string) => void; onRefresh: () => void }) => (
    <div data-testid="port-selector">
      <button data-testid="port-select-trigger" onClick={() => props.onPortChange('/dev/ttyUSB0')}>
        Select Port
      </button>
      <button data-testid="port-refresh" onClick={props.onRefresh}>
        Refresh
      </button>
      <span data-testid="selected-port">{props.selectedPort}</span>
    </div>
  ),
}));

vi.mock('@/renderer/presentation/components/DeviceSelector', () => ({
  DeviceSelector: (props: {
    selectedManufacturer: string;
    selectedDeviceId: string;
    manufacturerOptions: { value: string; label: string }[];
    onManufacturerChange: (v: string) => void;
    onDeviceChange: (v: string) => void;
  }) => (
    <div data-testid="device-selector">
      <button data-testid="manufacturer-select-trigger" onClick={() => props.onManufacturerChange('DISAG')}>
        Select Manufacturer
      </button>
      <button data-testid="device-select-trigger" onClick={() => props.onDeviceChange('MT201')}>
        Select Device
      </button>
      <span data-testid="selected-manufacturer">{props.selectedManufacturer}</span>
      <span data-testid="selected-device">{props.selectedDeviceId}</span>
      <span data-testid="manufacturer-options">
        {props.manufacturerOptions.map(({ value, label }) => `${value}:${label}`).join(',')}
      </span>
    </div>
  ),
}));

const mockSaveConnectionSettings = vi.mocked(settingsService.saveConnectionSettings);
const mockGetConnectionSettings = vi.mocked(settingsService.getConnectionSettings);
const mockSaveUserPreferences = vi.mocked(settingsService.saveUserPreferences);

const mockUseConnection = vi.mocked(useConnection);
const mockUsePortList = vi.mocked(usePortList);
const mockUseDeviceList = vi.mocked(useDeviceList);
let portListState: ReturnType<typeof usePortList> = { ...defaultPortListResult };

// ============================================================
// Tests
// ============================================================

describe('SettingsConnectionTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConnection.mockReturnValue({ ...defaultConnectionResult });
    portListState = { ...defaultPortListResult };
    mockUsePortList.mockImplementation(() => portListState);
    mockUseDeviceList.mockReturnValue({ ...defaultDeviceListResult });
    useSessionStore.getState().resetSession();
    useSessionStore.getState().setLaneNumber(1);
  });

  describe('rendering', () => {
    it('displays PortSelector', () => {
      render(<SettingsConnectionTab />);
      expect(screen.getByTestId('port-selector')).toBeInTheDocument();
    });

    it('displays DeviceSelector', () => {
      render(<SettingsConnectionTab />);
      expect(screen.getByTestId('device-selector')).toBeInTheDocument();
    });

    it('offers KOHTO and DISAG as target manufacturers', () => {
      render(<SettingsConnectionTab />);

      expect(screen.getByTestId('manufacturer-options')).toHaveTextContent('KOHTO:Kohto Electronics,DISAG:DISAG');
    });

    it('displays the Connect button by default (disconnected state)', () => {
      render(<SettingsConnectionTab />);
      expect(screen.getByText('Connect')).toBeInTheDocument();
    });
  });

  describe('connection', () => {
    it('clicking Connect calls connect with the correct arguments', async () => {
      // Simulate a state where selectedDeviceId is set
      mockUseDeviceList.mockReturnValue({
        ...defaultDeviceListResult,
        selectedDeviceId: 'MT201',
      });

      render(<SettingsConnectionTab />);

      // Select a port
      fireEvent.click(screen.getByTestId('port-select-trigger'));

      // Click the Connect button
      fireEvent.click(screen.getByText('Connect'));

      await waitFor(() => {
        expect(mockConnect).toHaveBeenCalledWith('/dev/ttyUSB0', 'KOHTO', 'MT201', 9600);
      });
    });

    it('Connect button is disabled when no port is selected', () => {
      render(<SettingsConnectionTab />);

      const connectButton = screen.getByText('Connect');
      expect(connectButton).toBeDisabled();
    });

    it('Connect button is disabled when isConnecting=true', () => {
      mockUseConnection.mockReturnValue({
        ...defaultConnectionResult,
        isConnecting: true,
      });

      render(<SettingsConnectionTab />);

      // Select a port (button remains disabled due to isConnecting)
      fireEvent.click(screen.getByTestId('port-select-trigger'));

      const connectButton = screen.getByText('Connecting...');
      expect(connectButton).toBeDisabled();
    });

    it('Connect button is disabled when multiple devices exist and none is selected', () => {
      mockUseDeviceList.mockReturnValue({
        ...defaultDeviceListResult,
        deviceOptions: [
          {
            id: 'MT201',
            manufacturer: 'KOHTO',
            displayName: 'MT201',
            baudRate: 9600,
            supportedDisciplines: ['AIR_RIFLE_10M'],
          },
          {
            id: 'BPT216',
            manufacturer: 'KOHTO',
            displayName: 'BPT-216',
            baudRate: 115200,
            supportedDisciplines: ['BEAM_PISTOL_10M'],
          },
        ],
        selectedDeviceId: '',
      });

      render(<SettingsConnectionTab />);

      // Select a port
      fireEvent.click(screen.getByTestId('port-select-trigger'));

      const connectButton = screen.getByText('Connect');
      expect(connectButton).toBeDisabled();
    });

    it('Connect button is enabled when only one device exists even without device selection', () => {
      mockUseDeviceList.mockReturnValue({
        ...defaultDeviceListResult,
        deviceOptions: [
          {
            id: 'MT201',
            manufacturer: 'KOHTO',
            displayName: 'MT201',
            baudRate: 9600,
            supportedDisciplines: ['AIR_RIFLE_10M'],
          },
        ],
        selectedDeviceId: '',
      });

      render(<SettingsConnectionTab />);

      // Select a port
      fireEvent.click(screen.getByTestId('port-select-trigger'));

      const connectButton = screen.getByText('Connect');
      expect(connectButton).not.toBeDisabled();
    });

    it('keeps Connect enabled for a user-selected port after a later port scan returns empty', () => {
      const { rerender } = render(<SettingsConnectionTab />);

      fireEvent.click(screen.getByTestId('port-select-trigger'));
      expect(screen.getByText('Connect')).not.toBeDisabled();

      portListState = {
        ...defaultPortListResult,
        ports: [],
        portOptions: [],
      };
      rerender(<SettingsConnectionTab />);

      expect(screen.getByText('Connect')).not.toBeDisabled();
    });

    it('Connect button stays enabled for the restored saved port even when the current port scan is empty', async () => {
      mockGetConnectionSettings.mockResolvedValueOnce({
        portName: '/dev/ttyUSB9',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
      });

      render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(screen.getByTestId('selected-port')).toHaveTextContent('/dev/ttyUSB9');
      });

      expect(screen.getByText('Connect')).not.toBeDisabled();
    });
  });

  describe('disconnection', () => {
    it('displays the Disconnect button in connected state', () => {
      mockUseConnection.mockReturnValue({
        ...defaultConnectionResult,
        status: 'connected',
        connectionId: 'conn-1',
      });

      render(<SettingsConnectionTab />);

      expect(screen.getByText('Disconnect')).toBeInTheDocument();
      expect(screen.queryByText('Connect')).not.toBeInTheDocument();
    });

    it('clicking Disconnect calls disconnect', async () => {
      mockUseConnection.mockReturnValue({
        ...defaultConnectionResult,
        status: 'connected',
        connectionId: 'conn-1',
      });

      render(<SettingsConnectionTab />);

      fireEvent.click(screen.getByText('Disconnect'));

      await waitFor(() => {
        expect(mockDisconnect).toHaveBeenCalledTimes(1);
      });
    });

    it('Disconnect button is disabled when isDisconnecting=true', () => {
      mockUseConnection.mockReturnValue({
        ...defaultConnectionResult,
        status: 'connected',
        connectionId: 'conn-1',
        isDisconnecting: true,
      });

      render(<SettingsConnectionTab />);

      const disconnectButton = screen.getByText('Disconnecting...');
      expect(disconnectButton).toBeDisabled();
    });
  });

  describe('error display', () => {
    it('displays an error message when there is an error', () => {
      mockUseConnection.mockReturnValue({
        ...defaultConnectionResult,
        error: 'Connection failed',
      });

      render(<SettingsConnectionTab />);

      const errorElement = screen.getByRole('alert');
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveTextContent('Connection failed');
    });

    it('error display has aria-live="polite"', () => {
      mockUseConnection.mockReturnValue({
        ...defaultConnectionResult,
        error: 'Connection error',
      });

      render(<SettingsConnectionTab />);

      const errorElement = screen.getByRole('alert');
      expect(errorElement).toHaveAttribute('aria-live', 'polite');
    });

    it('error display is hidden when there is no error', () => {
      render(<SettingsConnectionTab />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('clearError is called when port changes', () => {
      render(<SettingsConnectionTab />);

      fireEvent.click(screen.getByTestId('port-select-trigger'));

      expect(mockClearError).toHaveBeenCalledTimes(1);
    });

    it('clearError is called when manufacturer changes', () => {
      render(<SettingsConnectionTab />);

      fireEvent.click(screen.getByTestId('manufacturer-select-trigger'));

      expect(mockClearError).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('selected-manufacturer')).toHaveTextContent('DISAG');
      expect(mockUseDeviceList).toHaveBeenLastCalledWith('DISAG');
    });

    it('clearError is called when device changes', () => {
      render(<SettingsConnectionTab />);

      fireEvent.click(screen.getByTestId('device-select-trigger'));

      expect(mockClearError).toHaveBeenCalledTimes(1);
    });
  });

  describe('settings persistence', () => {
    it('settingsService.saveConnectionSettings is called after successful connection (discipline not included)', async () => {
      render(<SettingsConnectionTab />);

      // Select a port
      fireEvent.click(screen.getByTestId('port-select-trigger'));

      // Click the Connect button
      fireEvent.click(screen.getByText('Connect'));

      await waitFor(() => {
        expect(mockSaveConnectionSettings).toHaveBeenCalledWith({
          portName: '/dev/ttyUSB0',
          manufacturer: 'KOHTO',
          deviceId: undefined,
          serialNumber: 'ABC123',
          vendorId: '0403',
          productId: '6001',
        });
      });
    });

    it('discipline is saved to userPreferences after successful connection', async () => {
      useSessionStore.getState().setDiscipline('AIR_RIFLE_10M');

      render(<SettingsConnectionTab />);

      // Select a port
      fireEvent.click(screen.getByTestId('port-select-trigger'));

      // Click the Connect button
      fireEvent.click(screen.getByText('Connect'));

      await waitFor(() => {
        expect(mockSaveUserPreferences).toHaveBeenCalledWith({
          discipline: 'AIR_RIFLE_10M',
        });
      });
    });

    it('userPreferences is not saved when discipline is not set', async () => {
      // discipline is null by default after resetSession
      render(<SettingsConnectionTab />);

      fireEvent.click(screen.getByTestId('port-select-trigger'));
      fireEvent.click(screen.getByText('Connect'));

      await waitFor(() => {
        expect(mockSaveConnectionSettings).toHaveBeenCalled();
      });

      expect(mockSaveUserPreferences).not.toHaveBeenCalled();
    });

    it('does not error when settings save fails (non-critical)', async () => {
      mockSaveConnectionSettings.mockRejectedValueOnce(new Error('Save failed'));

      render(<SettingsConnectionTab />);

      // Select a port
      fireEvent.click(screen.getByTestId('port-select-trigger'));

      // Click the Connect button - verify no error is thrown
      fireEvent.click(screen.getByText('Connect'));

      await waitFor(() => {
        expect(mockConnect).toHaveBeenCalled();
        expect(mockSaveConnectionSettings).toHaveBeenCalled();
      });
    });
  });

  describe('discipline setting on device selection', () => {
    it('sets the first supportedDiscipline when device changes', () => {
      render(<SettingsConnectionTab />);

      fireEvent.click(screen.getByTestId('device-select-trigger'));

      expect(mockSetDiscipline).toHaveBeenCalledWith('AIR_RIFLE_10M');
    });

    it('does not call setDiscipline for devices with empty supportedDisciplines', () => {
      mockUseDeviceList.mockReturnValue({
        ...defaultDeviceListResult,
        deviceOptions: [
          {
            id: 'CUSTOM1',
            manufacturer: 'KOHTO',
            displayName: 'Custom Device',
            baudRate: 9600,
            supportedDisciplines: [],
          },
        ],
      });

      render(<SettingsConnectionTab />);

      fireEvent.click(screen.getByTestId('device-select-trigger'));

      expect(mockSetDiscipline).not.toHaveBeenCalled();
    });
  });

  describe('initialization on mount', () => {
    it('fetchDevices is called with KOHTO on mount', async () => {
      render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(mockFetchDevices).toHaveBeenCalledWith('KOHTO', expect.any(AbortSignal), true);
      });
    });

    it('saved settings are restored on mount (port, manufacturer, deviceId)', async () => {
      mockGetConnectionSettings.mockResolvedValueOnce({
        portName: '/dev/ttyUSB1',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
      });

      render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(mockGetConnectionSettings).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('selected-port')).toHaveTextContent('/dev/ttyUSB1');
      });
      expect(screen.getByTestId('selected-manufacturer')).toHaveTextContent('KOHTO');
      await waitFor(() => {
        expect(mockSetSelectedDeviceId).toHaveBeenCalledWith('MT201');
      });
    });

    it('restores a saved DISAG RedDot selection after loading DISAG devices', async () => {
      const redDotDevice: TargetDeviceDto = {
        id: 'DISAG_KT_RDT_ZIE_1_RIFLE',
        manufacturer: 'DISAG',
        displayName: 'DISAG RedDot Rifle',
        baudRate: 9600,
        supportedDisciplines: ['AIR_RIFLE_10M'],
      };
      mockUseDeviceList.mockImplementation((manufacturer) => ({
        ...defaultDeviceListResult,
        deviceOptions: manufacturer === 'DISAG' ? [redDotDevice] : defaultDeviceListResult.deviceOptions,
      }));
      mockGetConnectionSettings.mockResolvedValueOnce({
        portName: '/dev/ttyUSB1',
        manufacturer: 'DISAG',
        deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE',
      });

      render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(screen.getByTestId('selected-manufacturer')).toHaveTextContent('DISAG');
      });
      await waitFor(() => {
        expect(mockSetSelectedDeviceId).toHaveBeenCalledWith('DISAG_KT_RDT_ZIE_1_RIFLE');
      });
    });

    it('resolves a moved saved device to the current port using serial number', async () => {
      mockGetConnectionSettings.mockResolvedValueOnce({
        portName: '/dev/ttyUSB9',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
        serialNumber: 'DEF456',
      });

      render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(mockGetConnectionSettings).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('selected-port')).toHaveTextContent('/dev/ttyUSB1');
      });
    });

    it('retries saved device resolution after the port list becomes available', async () => {
      mockGetConnectionSettings.mockResolvedValueOnce({
        portName: '/dev/ttyUSB9',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
        serialNumber: 'DEF456',
      });
      portListState = {
        ...defaultPortListResult,
        ports: [],
        portOptions: [],
      };

      const { rerender } = render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(mockGetConnectionSettings).toHaveBeenCalled();
      });

      expect(screen.getByTestId('selected-port')).toHaveTextContent('/dev/ttyUSB9');

      portListState = { ...defaultPortListResult };
      rerender(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(screen.getByTestId('selected-port')).toHaveTextContent('/dev/ttyUSB1');
      });
    });

    it('shows the saved port immediately while the port list is still loading', async () => {
      mockGetConnectionSettings.mockResolvedValueOnce({
        portName: '/dev/ttyUSB1',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
      });
      portListState = {
        ...defaultPortListResult,
        ports: [],
        portOptions: [],
        isLoadingPorts: true,
      };

      render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(mockGetConnectionSettings).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('selected-port')).toHaveTextContent('/dev/ttyUSB1');
      });
    });

    it('keeps Connect enabled while the saved port is shown and the port list is still loading', async () => {
      mockGetConnectionSettings.mockResolvedValueOnce({
        portName: '/dev/ttyUSB1',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
      });
      portListState = {
        ...defaultPortListResult,
        ports: [],
        portOptions: [],
        isLoadingPorts: true,
      };

      render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(mockGetConnectionSettings).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('selected-port')).toHaveTextContent('/dev/ttyUSB1');
      });

      expect(screen.getByText('Connect')).not.toBeDisabled();
    });

    it('keeps Connect enabled when the saved port is shown but a port refresh fails', async () => {
      mockGetConnectionSettings.mockResolvedValueOnce({
        portName: '/dev/ttyUSB1',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
      });
      portListState = {
        ...defaultPortListResult,
        ports: [],
        portOptions: [],
        portError: 'Failed to fetch port list' as string | null,
      };

      render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(mockGetConnectionSettings).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('selected-port')).toHaveTextContent('/dev/ttyUSB1');
      });

      expect(screen.getByText('Connect')).not.toBeDisabled();
    });

    it('keeps the user-selected port when the port list refreshes', async () => {
      mockGetConnectionSettings.mockResolvedValueOnce({
        portName: '/dev/ttyUSB1',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
      });

      const { rerender } = render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(screen.getByTestId('selected-port')).toHaveTextContent('/dev/ttyUSB1');
      });

      fireEvent.click(screen.getByTestId('port-select-trigger'));
      expect(screen.getByTestId('selected-port')).toHaveTextContent('/dev/ttyUSB0');

      portListState = {
        ...portListState,
        ports: [
          { path: '/dev/ttyUSB0', manufacturer: 'FTDI', serialNumber: 'ABC123', vendorId: '0403', productId: '6001' },
          { path: '/dev/ttyUSB1', manufacturer: 'FTDI', serialNumber: 'DEF456', vendorId: '0403', productId: '6001' },
          { path: '/dev/ttyUSB2', manufacturer: 'FTDI', serialNumber: 'GHI789', vendorId: '0403', productId: '6001' },
        ],
        portOptions: [
          { value: '/dev/ttyUSB0', label: '/dev/ttyUSB0 (FTDI)' },
          { value: '/dev/ttyUSB1', label: '/dev/ttyUSB1' },
          { value: '/dev/ttyUSB2', label: '/dev/ttyUSB2' },
        ],
      };

      rerender(<SettingsConnectionTab />);

      expect(screen.getByTestId('selected-port')).toHaveTextContent('/dev/ttyUSB0');
    });

    it('laneNumber is not restored from connectionSettings on mount', async () => {
      mockGetConnectionSettings.mockResolvedValueOnce({
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
      });

      render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(mockGetConnectionSettings).toHaveBeenCalled();
      });

      // laneNumber remains at default value (1) (restored from userPreferences via a separate flow)
      expect(useSessionStore.getState().laneNumber).toBe(1);
    });

    it('discipline is not restored from connectionSettings on mount (userPreferences is the single source)', async () => {
      mockGetConnectionSettings.mockResolvedValueOnce({
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
      });

      render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(mockGetConnectionSettings).toHaveBeenCalled();
      });

      // discipline is not restored from connectionSettings
      expect(mockSetDiscipline).not.toHaveBeenCalled();
    });

    it('does not error when saved settings are empty', async () => {
      mockGetConnectionSettings.mockResolvedValueOnce({
        portName: '',
        manufacturer: 'KOHTO',
      });

      render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(mockGetConnectionSettings).toHaveBeenCalled();
      });

      // portName is empty so setSelectedPort is not called (remains default)
      expect(screen.getByTestId('selected-port')).toHaveTextContent('');
      // deviceId is undefined so setSelectedDeviceId is not called
      expect(mockSetSelectedDeviceId).not.toHaveBeenCalled();
    });

    it('does not error when getConnectionSettings fails', async () => {
      mockGetConnectionSettings.mockRejectedValueOnce(new Error('Storage error'));

      // Verify no error is thrown
      render(<SettingsConnectionTab />);

      await waitFor(() => {
        expect(mockGetConnectionSettings).toHaveBeenCalled();
      });

      // Component renders normally
      expect(screen.getByTestId('port-selector')).toBeInTheDocument();
    });
  });
});

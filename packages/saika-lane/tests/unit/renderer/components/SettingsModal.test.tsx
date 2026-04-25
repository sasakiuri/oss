// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsModal } from '@/renderer/presentation/components/SettingsModal';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { useUpdateStore } from '@/renderer/presentation/stores/updateStore';
import { settingsService } from '@/renderer/services/settingsService';
import { updateService } from '@/renderer/services/updateService';
import { settingsContract } from '@/shared/ipc/contracts';

// Mock settingsService
vi.mock('@/renderer/services/settingsService', () => ({
  settingsService: {
    saveUserPreferences: vi.fn().mockResolvedValue(undefined),
    getUserPreferences: vi.fn().mockResolvedValue({ laneNumber: 1 }),
    saveConnectionSettings: vi.fn().mockResolvedValue(undefined),
    getConnectionSettings: vi.fn().mockResolvedValue({}),
    saveAppSettings: vi.fn().mockResolvedValue(undefined),
    getAppSettings: vi.fn().mockResolvedValue({
      connection: {
        portName: '',
        manufacturer: 'KOHTO',
        deviceId: '',
        serialNumber: '',
        vendorId: '',
        productId: '',
      },
      userPreferences: { laneNumber: 1, discipline: null, competitionTypeId: '', audioVolume: 50 },
      mqtt: {
        enabled: false,
        brokerUrl: '',
        laneAlias: '',
        autoConnect: false,
        laneId: '550e8400-e29b-41d4-a716-446655440000',
      },
    }),
    getSettingsFileInfo: vi.fn().mockResolvedValue({ path: '/tmp/settings.json' }),
  },
}));

vi.mock('@/renderer/services/updateService', () => ({
  updateService: {
    getUpdateState: vi.fn().mockResolvedValue({
      status: 'idle',
      currentVersion: '0.2.1',
      targetVersion: null,
      releaseName: null,
      releaseDate: null,
      releaseNotes: null,
      downloadPercent: null,
      transferredBytes: null,
      totalBytes: null,
      bytesPerSecond: null,
      lastCheckedAt: null,
      errorMessage: null,
      canCheckForUpdates: true,
      canInstallUpdate: false,
    }),
    checkForUpdates: vi.fn().mockResolvedValue({
      status: 'checking',
      currentVersion: '0.2.1',
      targetVersion: null,
      releaseName: null,
      releaseDate: null,
      releaseNotes: null,
      downloadPercent: null,
      transferredBytes: null,
      totalBytes: null,
      bytesPerSecond: null,
      lastCheckedAt: null,
      errorMessage: null,
      canCheckForUpdates: false,
      canInstallUpdate: false,
    }),
    quitAndInstall: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockSaveUserPreferences = vi.mocked(settingsService.saveUserPreferences);
const mockSaveAppSettings = vi.mocked(settingsService.saveAppSettings);
const mockGetAppSettings = vi.mocked(settingsService.getAppSettings);
const mockCheckForUpdates = vi.mocked(updateService.checkForUpdates);
const mockQuitAndInstall = vi.mocked(updateService.quitAndInstall);

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  X: ({ size, ...props }: { size?: number } & Record<string, unknown>) => (
    <svg data-testid="x-icon" width={size} height={size} {...props} />
  ),
  Volume2: ({ size, ...props }: { size?: number } & Record<string, unknown>) => (
    <svg data-testid="volume2-icon" width={size} height={size} {...props} />
  ),
}));

// Mock useAudioPlayback
const mockPlayTestSound = vi.fn();
vi.mock('@/renderer/presentation/hooks/useAudioPlayback', () => ({
  useAudioPlayback: () => ({
    playShotSound: vi.fn(),
    playTestSound: mockPlayTestSound,
  }),
}));

// Mock SettingsConnectionTab
vi.mock('@/renderer/presentation/components/settings/SettingsConnectionTab', () => ({
  SettingsConnectionTab: () => <div data-testid="settings-connection-tab">ConnectionTab</div>,
}));

// Mock SettingsTargetTab
vi.mock('@/renderer/presentation/components/settings/SettingsTargetTab', () => ({
  SettingsTargetTab: () => <div data-testid="settings-target-tab">TargetTab</div>,
}));

describe('SettingsModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store
    useSessionStore.getState().resetSession();
    useUpdateStore.getState().reset();
  });

  describe('show/hide', () => {
    it('renders nothing when isOpen=false', () => {
      const { container } = render(<SettingsModal isOpen={false} onClose={mockOnClose} />);

      expect(container.innerHTML).toBe('');
    });

    it('renders the modal when isOpen=true', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('displays the Settings title', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  describe('tab structure', () => {
    it('displays all tabs including JSON', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('General')).toBeInTheDocument();
      expect(screen.getByText('Target')).toBeInTheDocument();
      expect(screen.getByText('Connection')).toBeInTheDocument();
      expect(screen.getByText('MQTT')).toBeInTheDocument();
      expect(screen.getByText('JSON')).toBeInTheDocument();
    });

    it('General tab is active by default', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const generalTab = screen.getByText('General');
      expect(generalTab).toHaveClass('text-blue-400');

      const targetTab = screen.getByText('Target');
      expect(targetTab).toHaveClass('text-zinc-400');

      const connectionTab = screen.getByText('Connection');
      expect(connectionTab).toHaveClass('text-zinc-400');
    });

    it('clicking the Target tab displays SettingsTargetTab', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText('Target'));

      expect(screen.getByTestId('settings-target-tab')).toBeInTheDocument();
      // General content should not be visible
      expect(screen.queryByLabelText('Lane Number')).not.toBeInTheDocument();
    });

    it('clicking the Connection tab displays Connection content', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText('Connection'));

      expect(screen.getByTestId('settings-connection-tab')).toBeInTheDocument();
      // General content should not be visible
      expect(screen.queryByLabelText('Lane Number')).not.toBeInTheDocument();
    });

    it('clicking the General tab returns to General content', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      // Switch to Connection
      fireEvent.click(screen.getByText('Connection'));
      expect(screen.queryByLabelText('Lane Number')).not.toBeInTheDocument();

      // Switch back to General
      fireEvent.click(screen.getByText('General'));
      expect(screen.getByLabelText('Lane Number')).toBeInTheDocument();
    });

    it('Target tab is active when initialTab="target"', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} initialTab="target" />);

      const targetTab = screen.getByText('Target');
      expect(targetTab).toHaveClass('text-blue-400');

      expect(screen.getByTestId('settings-target-tab')).toBeInTheDocument();
      expect(screen.queryByLabelText('Lane Number')).not.toBeInTheDocument();
    });

    it('Connection tab is active when initialTab="connection"', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} initialTab="connection" />);

      const connectionTab = screen.getByText('Connection');
      expect(connectionTab).toHaveClass('text-blue-400');

      expect(screen.getByTestId('settings-connection-tab')).toBeInTheDocument();
      expect(screen.queryByLabelText('Lane Number')).not.toBeInTheDocument();
    });

    it('General tab is the default when initialTab is not specified', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const generalTab = screen.getByText('General');
      expect(generalTab).toHaveClass('text-blue-400');

      expect(screen.getByLabelText('Lane Number')).toBeInTheDocument();
    });

    it('resets to initialTab when the modal is reopened', () => {
      const { rerender } = render(<SettingsModal isOpen={true} onClose={mockOnClose} initialTab="target" />);

      // Switch to Connection tab
      fireEvent.click(screen.getByText('Connection'));
      expect(screen.getByTestId('settings-connection-tab')).toBeInTheDocument();

      // Close and reopen
      rerender(<SettingsModal isOpen={false} onClose={mockOnClose} initialTab="target" />);
      rerender(<SettingsModal isOpen={true} onClose={mockOnClose} initialTab="target" />);

      // Should be back on Target tab (per initialTab)
      const targetTab = screen.getByText('Target');
      expect(targetTab).toHaveClass('text-blue-400');
      expect(screen.getByTestId('settings-target-tab')).toBeInTheDocument();
      expect(screen.queryByTestId('settings-connection-tab')).not.toBeInTheDocument();
    });

    it('SettingsConnectionTab is rendered when the Connection tab is displayed', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText('Connection'));

      expect(screen.getByTestId('settings-connection-tab')).toBeInTheDocument();
      expect(screen.getByText('ConnectionTab')).toBeInTheDocument();
    });

    it('JSON tab displays settings document metadata', async () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText('JSON'));

      expect(await screen.findByText('/tmp/settings.json')).toBeInTheDocument();
      expect(screen.getByLabelText('Settings Document')).toBeInTheDocument();
    });
  });

  describe('application update section', () => {
    it('displays the application update section on the General tab', async () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Application Update')).toBeInTheDocument();
      expect(screen.getByText('Current Version: 0.1.0')).toBeInTheDocument();
    });

    it('triggers an update check from the General tab', async () => {
      mockCheckForUpdates.mockResolvedValueOnce({
        status: 'checking',
        currentVersion: '0.2.1',
        targetVersion: null,
        releaseName: null,
        releaseDate: null,
        releaseNotes: null,
        downloadPercent: null,
        transferredBytes: null,
        totalBytes: null,
        bytesPerSecond: null,
        lastCheckedAt: null,
        errorMessage: null,
        canCheckForUpdates: false,
        canInstallUpdate: false,
      });

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const button = await screen.findByText('Check for Updates');
      await waitFor(() => {
        expect(button).not.toBeDisabled();
      });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockCheckForUpdates).toHaveBeenCalledTimes(1);
      });
    });

    it('shows Restart & Install when a downloaded update is available', async () => {
      useUpdateStore.getState().setState({
        status: 'downloaded',
        currentVersion: '0.2.1',
        targetVersion: '0.2.2',
        releaseName: 'Saika Lane 0.2.2',
        releaseDate: '2026-04-23T00:00:00.000Z',
        releaseNotes: 'Fixes',
        downloadPercent: 100,
        transferredBytes: 4096,
        totalBytes: 4096,
        bytesPerSecond: 1024,
        lastCheckedAt: '2026-04-23T00:00:00.000Z',
        errorMessage: null,
        canCheckForUpdates: false,
        canInstallUpdate: true,
      });

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(await screen.findByText('Restart & Install'));

      await waitFor(() => {
        expect(mockQuitAndInstall).toHaveBeenCalledTimes(1);
      });
    });

    it('does not let a stale checkForUpdates response overwrite a newer update event state', async () => {
      let resolveCheckForUpdates:
        | ((state: {
            status: 'available';
            currentVersion: string;
            targetVersion: string;
            releaseName: string;
            releaseDate: string;
            releaseNotes: string;
            downloadPercent: null;
            transferredBytes: null;
            totalBytes: null;
            bytesPerSecond: null;
            lastCheckedAt: string;
            errorMessage: null;
            canCheckForUpdates: false;
            canInstallUpdate: false;
          }) => void)
        | null = null;

      mockCheckForUpdates.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCheckForUpdates = resolve;
        }),
      );

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(await screen.findByText('Check for Updates'));

      await waitFor(() => {
        expect(mockCheckForUpdates).toHaveBeenCalledTimes(1);
      });

      act(() => {
        useUpdateStore.getState().setState({
          status: 'downloaded',
          currentVersion: '0.2.1',
          targetVersion: '0.2.2',
          releaseName: 'Saika Lane 0.2.2',
          releaseDate: '2026-04-23T00:00:00.000Z',
          releaseNotes: 'Fixes',
          downloadPercent: 100,
          transferredBytes: 4096,
          totalBytes: 4096,
          bytesPerSecond: 1024,
          lastCheckedAt: '2026-04-23T00:00:00.000Z',
          errorMessage: null,
          canCheckForUpdates: false,
          canInstallUpdate: true,
        });
      });

      expect(screen.getByText('Restart & Install')).toBeInTheDocument();

      await act(async () => {
        resolveCheckForUpdates?.({
          status: 'available',
          currentVersion: '0.2.1',
          targetVersion: '0.2.2',
          releaseName: 'Saika Lane 0.2.2',
          releaseDate: '2026-04-23T00:00:00.000Z',
          releaseNotes: 'Fixes',
          downloadPercent: null,
          transferredBytes: null,
          totalBytes: null,
          bytesPerSecond: null,
          lastCheckedAt: '2026-04-23T00:00:00.000Z',
          errorMessage: null,
          canCheckForUpdates: false,
          canInstallUpdate: false,
        });
        await Promise.resolve();
      });

      expect(screen.getByText('Restart & Install')).toBeInTheDocument();
    });

    it('clears a stale manual update error after a later successful update state arrives', async () => {
      mockCheckForUpdates.mockRejectedValueOnce(new Error('IPC failed'));

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(await screen.findByText('Check for Updates'));

      expect(await screen.findByText('IPC failed')).toBeInTheDocument();

      act(() => {
        useUpdateStore.getState().setState({
          status: 'downloaded',
          currentVersion: '0.2.1',
          targetVersion: '0.2.2',
          releaseName: 'Saika Lane 0.2.2',
          releaseDate: '2026-04-23T00:00:00.000Z',
          releaseNotes: 'Fixes',
          downloadPercent: 100,
          transferredBytes: 4096,
          totalBytes: 4096,
          bytesPerSecond: 1024,
          lastCheckedAt: '2026-04-23T00:00:00.000Z',
          errorMessage: null,
          canCheckForUpdates: false,
          canInstallUpdate: true,
        });
      });

      expect(screen.queryByText('IPC failed')).not.toBeInTheDocument();
      expect(screen.getByText('Restart & Install')).toBeInTheDocument();
    });

    it('replaces a stale manual update error when a later updater error state arrives', async () => {
      mockCheckForUpdates.mockRejectedValueOnce(new Error('IPC failed'));

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(await screen.findByText('Check for Updates'));

      expect(await screen.findByText('IPC failed')).toBeInTheDocument();

      act(() => {
        useUpdateStore.getState().setState({
          status: 'error',
          currentVersion: '0.2.1',
          targetVersion: null,
          releaseName: null,
          releaseDate: null,
          releaseNotes: null,
          downloadPercent: null,
          transferredBytes: null,
          totalBytes: null,
          bytesPerSecond: null,
          lastCheckedAt: '2026-04-23T00:00:00.000Z',
          errorMessage: 'network down',
          canCheckForUpdates: true,
          canInstallUpdate: false,
        });
      });

      expect(screen.queryByText('IPC failed')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('network down');
    });
  });

  describe('lane number input', () => {
    it('displays the Lane Number label', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByLabelText('Lane Number')).toBeInTheDocument();
    });

    it('displays the current lane number as the input value', () => {
      useSessionStore.getState().setLaneNumber(5);

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const input = screen.getByLabelText('Lane Number') as HTMLInputElement;
      expect(input.value).toBe('5');
    });

    it('can change the input value', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const input = screen.getByLabelText('Lane Number') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '3' } });

      expect(input.value).toBe('3');
    });

    it('displays help text', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Please enter an integer of 1 or greater')).toBeInTheDocument();
    });
  });

  describe('test sound button', () => {
    it('displays the Test sound button', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByLabelText('Test sound')).toBeInTheDocument();
    });

    it('clicking the Test sound button calls playTestSound with the current volume', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByLabelText('Test sound'));

      // Default audioVolume is 50
      expect(mockPlayTestSound).toHaveBeenCalledWith(50);
    });

    it('clicking the Test sound button after changing the volume slider calls with the updated volume', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const slider = screen.getByLabelText('Shot Sound Volume') as HTMLInputElement;
      fireEvent.change(slider, { target: { value: '80' } });

      fireEvent.click(screen.getByLabelText('Test sound'));

      expect(mockPlayTestSound).toHaveBeenCalledWith(80);
    });
  });

  describe('save', () => {
    it('clicking Save saves the lane number', async () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const input = screen.getByLabelText('Lane Number') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '7' } });

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(useSessionStore.getState().laneNumber).toBe(7);
      });
    });

    it('clicking Save persists to settingsService', async () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const input = screen.getByLabelText('Lane Number') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '3' } });

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockSaveUserPreferences).toHaveBeenCalledWith({ laneNumber: 3, audioVolume: 50 });
      });
    });

    it('calls onClose after Save', async () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      });
    });

    it('does not save lane number for invalid values (0 or less), but saves volume', async () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const input = screen.getByLabelText('Lane Number') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '0' } });

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockSaveUserPreferences).toHaveBeenCalledWith({ audioVolume: 50 });
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      });
    });

    it('does not save lane number for invalid values (string), but saves volume', async () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const input = screen.getByLabelText('Lane Number') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'abc' } });

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockSaveUserPreferences).toHaveBeenCalledWith({ audioVolume: 50 });
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      });
    });

    it('displays an error and does not close the modal when persistence fails', async () => {
      mockSaveUserPreferences.mockRejectedValueOnce(new Error('Save failed'));

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const input = screen.getByLabelText('Lane Number') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '5' } });

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
        expect(mockOnClose).not.toHaveBeenCalled();
        // Store should NOT be updated on failure
        expect(useSessionStore.getState().laneNumber).toBe(1);
      });
    });

    it('closes the modal when saving succeeds after a persistence failure', async () => {
      mockSaveUserPreferences.mockRejectedValueOnce(new Error('Save failed'));

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const input = screen.getByLabelText('Lane Number') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '5' } });

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
      });

      // Fix the mock to succeed on retry
      mockSaveUserPreferences.mockResolvedValueOnce(undefined);
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1);
        expect(useSessionStore.getState().laneNumber).toBe(5);
      });
    });
  });

  describe('json editing', () => {
    it('saves the full settings document from the JSON tab', async () => {
      const updatedSettings = {
        connection: {
          portName: 'COM9',
          manufacturer: 'KOHTO' as const,
          deviceId: 'MT201',
          serialNumber: 'ABC123',
          vendorId: '0403',
          productId: '6001',
        },
        userPreferences: {
          laneNumber: 9,
          discipline: null,
          competitionTypeId: 'standard',
          audioVolume: 60,
        },
        mqtt: {
          enabled: false,
          brokerUrl: '',
          laneAlias: '',
          autoConnect: false,
          laneId: '550e8400-e29b-41d4-a716-446655440000',
        },
      };
      mockGetAppSettings.mockResolvedValueOnce(updatedSettings).mockResolvedValueOnce(updatedSettings);

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText('JSON'));

      const textarea = (await screen.findByLabelText('Settings Document')) as HTMLTextAreaElement;
      fireEvent.change(textarea, {
        target: {
          value: JSON.stringify(updatedSettings, null, 2),
        },
      });

      fireEvent.click(screen.getByText('Save JSON'));

      await waitFor(() => {
        expect(mockSaveAppSettings).toHaveBeenCalled();
        expect(useSessionStore.getState().laneNumber).toBe(9);
      });
    });

    it('reloads the JSON editor without applying settings to stores', async () => {
      const reloadedSettings = {
        connection: {
          portName: '',
          manufacturer: 'KOHTO' as const,
          deviceId: '',
          serialNumber: '',
          vendorId: '',
          productId: '',
        },
        userPreferences: {
          laneNumber: 9,
          discipline: null,
          competitionTypeId: '',
          audioVolume: 60,
        },
        mqtt: {
          enabled: false,
          brokerUrl: '',
          laneAlias: '',
          autoConnect: false,
          laneId: '550e8400-e29b-41d4-a716-446655440000',
        },
      };
      mockGetAppSettings.mockResolvedValueOnce({
        connection: {
          portName: '',
          manufacturer: 'KOHTO',
          deviceId: '',
          serialNumber: '',
          vendorId: '',
          productId: '',
        },
        userPreferences: {
          laneNumber: 1,
          discipline: null,
          competitionTypeId: '',
          audioVolume: 50,
        },
        mqtt: {
          enabled: false,
          brokerUrl: '',
          laneAlias: '',
          autoConnect: false,
          laneId: '550e8400-e29b-41d4-a716-446655440000',
        },
      });
      mockGetAppSettings.mockResolvedValueOnce(reloadedSettings);

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText('JSON'));

      const textarea = (await screen.findByLabelText('Settings Document')) as HTMLTextAreaElement;
      expect(textarea.value).toContain('"laneNumber": 1');

      fireEvent.click(screen.getByText('Reload'));

      await waitFor(() => {
        expect(textarea.value).toContain('"laneNumber": 9');
      });
      expect(useSessionStore.getState().laneNumber).toBe(1);
    });

    it('allows saving a JSON document without mqtt.laneId', async () => {
      const editableSettings = {
        connection: {
          portName: 'COM9',
          manufacturer: 'KOHTO' as const,
          deviceId: 'MT201',
          serialNumber: 'ABC123',
          vendorId: '0403',
          productId: '6001',
        },
        userPreferences: {
          laneNumber: 9,
          discipline: null,
          competitionTypeId: 'standard',
          audioVolume: 60,
        },
        mqtt: {
          enabled: false,
          brokerUrl: '',
          laneAlias: '',
          autoConnect: false,
        },
      };
      const normalizedSettings = {
        ...editableSettings,
        mqtt: {
          ...editableSettings.mqtt,
          laneId: '550e8400-e29b-41d4-a716-446655440000',
        },
      };
      mockGetAppSettings.mockResolvedValueOnce(normalizedSettings).mockResolvedValueOnce(normalizedSettings);

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText('JSON'));

      const textarea = (await screen.findByLabelText('Settings Document')) as HTMLTextAreaElement;
      fireEvent.change(textarea, {
        target: {
          value: JSON.stringify(editableSettings, null, 2),
        },
      });

      fireEvent.click(screen.getByText('Save JSON'));

      await waitFor(() => {
        expect(mockSaveAppSettings).toHaveBeenCalledWith(editableSettings);
        expect(useSessionStore.getState().laneNumber).toBe(9);
      });
    });

    it('treats an empty mqtt.laneId as auto-managed when saving JSON', async () => {
      const editableSettings = {
        connection: {
          portName: 'COM9',
          manufacturer: 'KOHTO' as const,
          deviceId: 'MT201',
          serialNumber: 'ABC123',
          vendorId: '0403',
          productId: '6001',
        },
        userPreferences: {
          laneNumber: 9,
          discipline: null,
          competitionTypeId: 'standard',
          audioVolume: 60,
        },
        mqtt: {
          enabled: false,
          brokerUrl: '',
          laneAlias: '',
          autoConnect: false,
          laneId: '',
        },
      };
      const normalizedSettings = {
        ...editableSettings,
        mqtt: {
          ...editableSettings.mqtt,
          laneId: '550e8400-e29b-41d4-a716-446655440000',
        },
      };
      mockGetAppSettings.mockResolvedValueOnce(normalizedSettings).mockResolvedValueOnce(normalizedSettings);
      mockSaveAppSettings.mockImplementationOnce(async (settings) => {
        const result = settingsContract.procedures.saveAppSettings.input.safeParse({ settings });
        if (!result.success) {
          throw new Error(result.error.issues[0]?.message ?? 'Validation failed');
        }
      });

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText('JSON'));

      const textarea = (await screen.findByLabelText('Settings Document')) as HTMLTextAreaElement;
      fireEvent.change(textarea, {
        target: {
          value: JSON.stringify(editableSettings, null, 2),
        },
      });

      fireEvent.click(screen.getByText('Save JSON'));

      await waitFor(() => {
        expect(mockSaveAppSettings).toHaveBeenCalledWith({
          ...editableSettings,
          mqtt: {
            enabled: false,
            brokerUrl: '',
            laneAlias: '',
            autoConnect: false,
          },
        });
        expect(useSessionStore.getState().laneNumber).toBe(9);
      });
    });

    it('routes parseable but incomplete JSON documents through settings validation instead of crashing in the editor', async () => {
      mockSaveAppSettings.mockImplementationOnce(async (settings) => {
        const result = settingsContract.procedures.saveAppSettings.input.safeParse({ settings });
        if (!result.success) {
          throw new Error(result.error.issues[0]?.message ?? 'Validation failed');
        }
      });

      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText('JSON'));

      const textarea = (await screen.findByLabelText('Settings Document')) as HTMLTextAreaElement;
      fireEvent.change(textarea, {
        target: {
          value: JSON.stringify(
            {
              connection: {
                portName: '',
                manufacturer: 'KOHTO',
                deviceId: '',
                serialNumber: '',
                vendorId: '',
                productId: '',
              },
              userPreferences: {
                laneNumber: 1,
                discipline: null,
                competitionTypeId: '',
                audioVolume: 50,
              },
            },
            null,
            2,
          ),
        },
      });

      fireEvent.click(screen.getByText('Save JSON'));

      await waitFor(() => {
        expect(mockSaveAppSettings).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('alert')).not.toHaveTextContent('Cannot read properties of undefined');
      });
    });

    it('clears the previous JSON document when reopening the tab and the next load fails', async () => {
      const { rerender } = render(<SettingsModal isOpen={true} onClose={mockOnClose} initialTab="json" />);

      const textarea = (await screen.findByLabelText('Settings Document')) as HTMLTextAreaElement;
      expect(textarea.value).toContain('"laneNumber": 1');
      expect(screen.getByText('/tmp/settings.json')).toBeInTheDocument();

      rerender(<SettingsModal isOpen={false} onClose={mockOnClose} initialTab="json" />);

      mockGetAppSettings.mockRejectedValueOnce(new Error('Load failed'));

      rerender(<SettingsModal isOpen={true} onClose={mockOnClose} initialTab="json" />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Load failed');
      });

      expect(screen.getByLabelText('Settings Document')).toHaveValue('');
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('does not overwrite user edits when the initial JSON load resolves after typing starts', async () => {
      let resolveSettings: ((value: Awaited<ReturnType<typeof settingsService.getAppSettings>>) => void) | undefined;
      let resolveMetadata:
        | ((value: Awaited<ReturnType<typeof settingsService.getSettingsFileInfo>>) => void)
        | undefined;

      mockGetAppSettings.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSettings = resolve;
          }),
      );
      vi.mocked(settingsService.getSettingsFileInfo).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveMetadata = resolve;
          }),
      );

      render(<SettingsModal isOpen={true} onClose={mockOnClose} initialTab="json" />);

      const textarea = (await screen.findByLabelText('Settings Document')) as HTMLTextAreaElement;
      fireEvent.change(textarea, {
        target: {
          value: '{\n  "userPreferences": {\n    "laneNumber": 9\n  }\n}',
        },
      });

      await act(async () => {
        resolveSettings?.({
          connection: {
            portName: '',
            manufacturer: 'KOHTO',
            deviceId: '',
            serialNumber: '',
            vendorId: '',
            productId: '',
          },
          userPreferences: {
            laneNumber: 1,
            discipline: null,
            competitionTypeId: '',
            audioVolume: 50,
          },
          mqtt: {
            enabled: false,
            brokerUrl: '',
            laneAlias: '',
            autoConnect: false,
            laneId: '550e8400-e29b-41d4-a716-446655440000',
          },
        });
        resolveMetadata?.({ path: '/tmp/settings.json' });
      });

      expect(textarea).toHaveValue('{\n  "userPreferences": {\n    "laneNumber": 9\n  }\n}');
    });

    it('still loads the JSON document when settings file metadata lookup fails', async () => {
      mockGetAppSettings.mockResolvedValueOnce({
        connection: {
          portName: 'COM9',
          manufacturer: 'KOHTO',
          deviceId: 'MT201',
          serialNumber: 'ABC123',
          vendorId: '0403',
          productId: '6001',
        },
        userPreferences: {
          laneNumber: 9,
          discipline: null,
          competitionTypeId: '',
          audioVolume: 60,
        },
        mqtt: {
          enabled: false,
          brokerUrl: '',
          laneAlias: '',
          autoConnect: false,
          laneId: '550e8400-e29b-41d4-a716-446655440000',
        },
      });
      vi.mocked(settingsService.getSettingsFileInfo).mockRejectedValueOnce(new Error('Path unavailable'));

      render(<SettingsModal isOpen={true} onClose={mockOnClose} initialTab="json" />);

      const textarea = (await screen.findByLabelText('Settings Document')) as HTMLTextAreaElement;

      await waitFor(() => {
        expect(textarea.value).toContain('"laneNumber": 9');
      });
    });
  });

  describe('cancel/close', () => {
    it('calls onClose when the Cancel button is clicked', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByText('Cancel'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the X button is clicked', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByLabelText('Close'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the backdrop is clicked', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const backdrop = screen.getByRole('dialog');
      fireEvent.click(backdrop);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when clicking inside the modal', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      // Click on the settings title inside the modal (not the backdrop)
      fireEvent.click(screen.getByText('Settings'));

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has the dialog role', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-modal=true', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('aria-labelledby references the title', () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const dialog = screen.getByRole('dialog');
      const titleId = dialog.getAttribute('aria-labelledby');
      expect(titleId).toBe('settings-title');

      const title = document.getElementById(titleId!);
      expect(title?.textContent).toBe('Settings');
    });
  });

  describe('state reset on reopen', () => {
    it('maintains the active tab when laneNumber changes while the modal is open', () => {
      const { rerender } = render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      // Switch to Connection tab
      fireEvent.click(screen.getByText('Connection'));
      expect(screen.getByTestId('settings-connection-tab')).toBeInTheDocument();

      // Simulate laneNumber change in store (triggers re-render)
      act(() => {
        useSessionStore.getState().setLaneNumber(99);
      });
      rerender(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      // Active tab should still be Connection, not reset to General
      expect(screen.getByTestId('settings-connection-tab')).toBeInTheDocument();
      expect(screen.queryByLabelText('Lane Number')).not.toBeInTheDocument();
    });

    it('resets input value to store value when the modal is reopened', () => {
      useSessionStore.getState().setLaneNumber(10);

      const { rerender } = render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      // Change the value
      const input = screen.getByLabelText('Lane Number') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '99' } });
      expect(input.value).toBe('99');

      // Close and reopen
      rerender(<SettingsModal isOpen={false} onClose={mockOnClose} />);
      rerender(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      const resetInput = screen.getByLabelText('Lane Number') as HTMLInputElement;
      expect(resetInput.value).toBe('10');
    });
  });
});

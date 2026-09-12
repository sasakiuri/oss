// SPDX-License-Identifier: MIT
import type { AppUpdateStateDto } from '@sasakiuri/saika-updater';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElectronEventBus } from '@/renderer/events/ElectronEventBus';
import { EventBusProvider } from '@/renderer/events/EventBusProvider';
import { AppUpdateSettingsPanel } from '@/renderer/presentation/features/settings/AppUpdateSettingsPanel';

const mocks = vi.hoisted(() => ({
  getUpdateState: vi.fn(),
  checkForUpdates: vi.fn(),
  quitAndInstall: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as null | ((state: AppUpdateStateDto) => void),
}));
vi.mock('@/renderer/services', () => ({ updaterService: mocks }));

const state: AppUpdateStateDto = {
  status: 'idle',
  currentVersion: '0.3.0',
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
};
const emit = (change: Partial<AppUpdateStateDto>) => act(() => mocks.listener!({ ...state, ...change }));
const renderPanel = () =>
  render(
    <EventBusProvider bus={new ElectronEventBus()}>
      <AppUpdateSettingsPanel />
    </EventBusProvider>,
  );

describe('application update settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        appVersion: '0.3.0',
        on: {
          appUpdateStateChanged: (listener: (next: AppUpdateStateDto) => void) => {
            mocks.listener = listener;
            return mocks.unsubscribe;
          },
        },
      },
    });
    mocks.getUpdateState.mockResolvedValue({ success: true, data: state });
    mocks.checkForUpdates.mockResolvedValue({
      success: true,
      data: { ...state, status: 'checking', canCheckForUpdates: false },
    });
    mocks.quitAndInstall.mockResolvedValue({ success: true });
  });

  it('shows the current version and disables updates in development builds', async () => {
    mocks.getUpdateState.mockResolvedValue({
      success: true,
      data: {
        ...state,
        status: 'unsupported',
        canCheckForUpdates: false,
        errorMessage: 'Auto-update is available only in packaged releases.',
      },
    });
    const { unmount } = renderPanel();
    expect(await screen.findByText('Auto-update is available only in packaged releases.')).toBeVisible();
    expect(screen.getByText('Current version: 0.3.0')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Restart and install' })).not.toBeInTheDocument();
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('shows check, download progress and readiness without installing automatically', async () => {
    renderPanel();
    const check = screen.getByRole('button', { name: 'Check for updates' });
    await waitFor(() => expect(check).toBeEnabled());
    fireEvent.click(check);
    expect(await screen.findByText('Checking for updates…')).toBeVisible();
    expect(check).toBeDisabled();
    emit({ status: 'downloading', downloadPercent: 42.4, targetVersion: '0.3.1', canCheckForUpdates: false });
    expect(screen.getByText('Downloading update… 42%')).toBeVisible();
    expect(screen.getByText('Update version: 0.3.1')).toBeVisible();
    emit({ status: 'downloaded', targetVersion: '0.3.1', canCheckForUpdates: false, canInstallUpdate: true });
    expect(mocks.quitAndInstall).not.toHaveBeenCalled();
    expect(screen.getByText(/Restarting stops competition control and Lane connections/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Restart and install' }));
    await waitFor(() => expect(mocks.quitAndInstall).toHaveBeenCalledOnce());
  });

  it('displays update errors and allows another check', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled());
    emit({ status: 'error', errorMessage: 'The update server is unavailable' });
    expect(screen.getByRole('alert')).toHaveTextContent('The update server is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText('Checking for updates…')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an installation error and keeps the retry control available', async () => {
    mocks.quitAndInstall.mockResolvedValue({ success: false, error: { message: 'Install could not start' } });
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled());
    emit({ status: 'downloaded', targetVersion: '0.3.1', canInstallUpdate: true });
    fireEvent.click(screen.getByRole('button', { name: 'Restart and install' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Install could not start');
    expect(screen.getByRole('button', { name: 'Restart and install' })).toBeEnabled();
  });

  it('keeps a newer pushed state when an initial query finishes late', async () => {
    let resolveQuery!: (response: unknown) => void;
    mocks.getUpdateState.mockReturnValue(
      new Promise((resolve) => {
        resolveQuery = resolve;
      }),
    );
    renderPanel();
    emit({ status: 'downloading', downloadPercent: 65, targetVersion: '0.3.1', canCheckForUpdates: false });
    await act(async () => resolveQuery({ success: true, data: state }));
    expect(screen.getByText('Downloading update… 65%')).toBeVisible();
  });
});

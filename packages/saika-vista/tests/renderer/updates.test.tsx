// SPDX-License-Identifier: MIT
import type { AppUpdateStateDto } from '@sasakiuri/saika-updater';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UpdateControls } from '../../src/renderer/UpdateControls';
import { updateBridge, updateState } from '../updateFixtures';

afterEach(cleanup);

describe('Vista updates', () => {
  it('explains installed-release support without treating a development build as a failure', async () => {
    render(<UpdateControls bridge={updateBridge()} />);
    expect(await screen.findByText('Version 0.3.0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('checks on request and only offers installation after downloading', async () => {
    const bridge = updateBridge({ ...updateState, status: 'idle', errorMessage: null, canCheckForUpdates: true });
    vi.mocked(bridge.check).mockResolvedValue({
      ...updateState,
      status: 'downloaded',
      targetVersion: '0.4.0',
      errorMessage: null,
      canInstallUpdate: true,
    });
    render(<UpdateControls bridge={bridge} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Restart and install' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restart and install' }));
    await waitFor(() => expect(bridge.install).toHaveBeenCalledTimes(1));
  });

  it('shows progress events and releases the subscription on unmount', async () => {
    const bridge = updateBridge();
    const unsubscribe = vi.fn();
    let changed!: (state: AppUpdateStateDto) => void;
    vi.mocked(bridge.onChange).mockImplementation((callback) => {
      changed = callback;
      return unsubscribe;
    });
    const view = render(<UpdateControls bridge={bridge} />);
    await screen.findByText('Version 0.3.0');
    act(() => changed({ ...updateState, status: 'downloading', downloadPercent: 42 }));
    expect(screen.getByRole('progressbar', { name: 'Update download' })).toHaveAttribute('value', '42');
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('retains a completed download when an older check response arrives later', async () => {
    const bridge = updateBridge({ ...updateState, status: 'idle', canCheckForUpdates: true });
    let changed!: (state: AppUpdateStateDto) => void;
    let finishCheck!: (state: AppUpdateStateDto) => void;
    vi.mocked(bridge.onChange).mockImplementation((callback) => {
      changed = callback;
      return () => {};
    });
    vi.mocked(bridge.check).mockReturnValue(
      new Promise((resolve) => {
        finishCheck = resolve;
      }),
    );
    render(<UpdateControls bridge={bridge} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await act(async () => {
      changed({ ...updateState, status: 'downloaded', canInstallUpdate: true });
      finishCheck({ ...updateState, status: 'checking' });
    });
    expect(screen.getByRole('button', { name: 'Restart and install' })).toBeEnabled();
  });

  it('keeps retry controls visible when the server returns lengthy diagnostics', async () => {
    const diagnostic =
      'Cannot find vista-latest-linux.yml in the latest release artifacts: 404\nHeaders: ' + 'details '.repeat(500);
    render(
      <UpdateControls
        bridge={updateBridge({ ...updateState, status: 'error', errorMessage: diagnostic, canCheckForUpdates: true })}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Update information is unavailable. Try again later.');
    expect(screen.getByText(/Headers:/)).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
    expect(screen.getByText('Technical details').closest('details')).not.toHaveAttribute('open');
  });

  it('keeps a failed or cancelled install retryable', async () => {
    const bridge = updateBridge({ ...updateState, status: 'downloaded', errorMessage: null, canInstallUpdate: true });
    vi.mocked(bridge.install).mockRejectedValue(new Error('Update installation was cancelled.'));
    render(<UpdateControls bridge={bridge} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Restart and install' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cancelled');
    expect(screen.getByRole('button', { name: 'Restart and install' })).toBeEnabled();
  });
});

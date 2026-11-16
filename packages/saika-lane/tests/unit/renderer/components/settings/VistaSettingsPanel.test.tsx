// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VistaSettingsPanel } from '@/renderer/presentation/components/settings/VistaSettingsPanel';
import type { LaneVistaStatus } from '@/shared/ipc/contracts/vista.contract';
import type { ElectronAPI } from '@/shared/types/ElectronAPI';

const disabled: LaneVistaStatus = {
  enabled: false,
  sourceId: 'lane-1',
  secret: 'secret-1',
  endpoints: [],
  error: null,
};
const enabled: LaneVistaStatus = {
  enabled: true,
  sourceId: 'lane-1',
  secret: 'secret-1',
  endpoints: ['https://192.0.2.10:7443', 'https://198.51.100.4:7443'],
  error: null,
};

const vista = {
  getStatus: vi.fn(),
  setEnabled: vi.fn(),
  resetPairing: vi.fn(),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** The shared renderer mock has no Vista namespace; install one per test. */
const api = window.electronAPI as { -readonly [K in keyof ElectronAPI]: ElectronAPI[K] };

describe('VistaSettingsPanel', () => {
  const original = api.vista;

  beforeEach(() => {
    vista.getStatus.mockResolvedValue({ success: true, data: disabled });
    api.vista = vista as unknown as ElectronAPI['vista'];
  });

  afterEach(() => {
    api.vista = original;
  });

  it('reads the status on mount and shows the sharing controls', async () => {
    render(<VistaSettingsPanel />);

    expect(screen.getByRole('region', { name: 'Saika Vista sharing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable sharing' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable sharing' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Reset pairing' })).toBeEnabled();
    expect(vista.getStatus).toHaveBeenCalledExactlyOnceWith();
    expect(screen.queryByLabelText('Vista pairing secret')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the endpoints and pairing secret while sharing is enabled', async () => {
    vista.getStatus.mockResolvedValue({ success: true, data: enabled });

    render(<VistaSettingsPanel />);

    expect(await screen.findByRole('button', { name: 'Disable sharing' })).toBeEnabled();
    expect(screen.getByText('https://192.0.2.10:7443')).toBeInTheDocument();
    expect(screen.getByText('https://198.51.100.4:7443')).toBeInTheDocument();
    expect(screen.getByLabelText('Vista pairing secret')).toHaveValue('secret-1');
  });

  it('shows a failed status read and keeps the controls disabled', async () => {
    vista.getStatus.mockResolvedValue({
      success: false,
      data: null,
      error: { code: 'VISTA_FAILED', message: 'Vista source failed to start' },
    });

    render(<VistaSettingsPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Vista source failed to start');
    expect(screen.getByRole('button', { name: 'Enable sharing' })).toBeDisabled();
  });

  it('shows a rejected status read', async () => {
    vista.getStatus.mockRejectedValue(new Error('IPC closed'));

    render(<VistaSettingsPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('IPC closed');
  });

  it('shows the error the source reports in its status', async () => {
    vista.getStatus.mockResolvedValue({ success: true, data: { ...enabled, error: 'Port 7443 is in use' } });

    render(<VistaSettingsPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Port 7443 is in use');
  });

  it('toggles sharing, disables both buttons while saving and shows the new status', async () => {
    const pending = deferred<unknown>();
    vista.setEnabled.mockReturnValue(pending.promise);
    render(<VistaSettingsPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable sharing' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Enable sharing' }));

    expect(vista.setEnabled).toHaveBeenCalledExactlyOnceWith({ enabled: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable sharing' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Reset pairing' })).toBeDisabled();
    pending.resolve({ success: true, data: enabled });
    expect(await screen.findByRole('button', { name: 'Disable sharing' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset pairing' })).toBeEnabled();
  });

  it('shows a failed toggle, then clears the error on the next action', async () => {
    vista.setEnabled.mockResolvedValueOnce({
      success: false,
      error: { code: 'VISTA_FAILED', message: 'Could not open the port' },
    });
    vista.resetPairing.mockResolvedValue({ success: true, data: { ...disabled, secret: 'secret-2' } });
    render(<VistaSettingsPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable sharing' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Enable sharing' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open the port');
    expect(screen.getByRole('button', { name: 'Enable sharing' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset pairing' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('shows a rejected toggle', async () => {
    vista.setEnabled.mockRejectedValue(new Error('IPC closed'));
    render(<VistaSettingsPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable sharing' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Enable sharing' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('IPC closed');
  });

  it('resets pairing and shows the new secret', async () => {
    vista.getStatus.mockResolvedValue({ success: true, data: enabled });
    vista.resetPairing.mockResolvedValue({ success: true, data: { ...enabled, secret: 'secret-2' } });
    render(<VistaSettingsPanel />);
    await screen.findByRole('button', { name: 'Disable sharing' });

    fireEvent.click(screen.getByRole('button', { name: 'Reset pairing' }));

    await waitFor(() => expect(screen.getByLabelText('Vista pairing secret')).toHaveValue('secret-2'));
    expect(vista.resetPairing).toHaveBeenCalledExactlyOnceWith({});
  });

  it('shows a failed pairing reset', async () => {
    vista.resetPairing.mockResolvedValue({
      success: false,
      error: { code: 'VISTA_FAILED', message: 'Could not rotate the secret' },
    });
    render(<VistaSettingsPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset pairing' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Reset pairing' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not rotate the secret');
  });
});

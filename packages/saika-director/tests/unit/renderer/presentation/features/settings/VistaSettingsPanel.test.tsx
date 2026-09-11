// SPDX-License-Identifier: MIT
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const { getSettings, setSettings } = vi.hoisted(() => ({ getSettings: vi.fn(), setSettings: vi.fn() }));
vi.mock('@/renderer/services', () => ({ vistaService: { getSettings, setSettings } }));
import { VistaSettingsPanel } from '@/renderer/presentation/features/settings/VistaSettingsPanel';
const settings = {
  enabled: false,
  port: 45832,
  running: false,
  endpoints: [],
  sourceId: 'source',
  pairingSecret: 'private-pairing-secret',
  error: null,
};
afterEach(cleanup);
describe('Vista settings', () => {
  it('applies sharing settings and exposes the pairing secret only on request', async () => {
    getSettings.mockResolvedValue({ success: true, data: settings });
    setSettings.mockResolvedValue({
      success: true,
      data: { ...settings, enabled: true, running: true, endpoints: ['http://192.168.1.10:45832'] },
    });
    render(<VistaSettingsPanel />);
    const secret = await screen.findByLabelText('Vista pairing secret');
    expect(secret).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show pairing secret' }));
    expect(secret).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByLabelText('Enable Vista sharing'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Vista settings' }));
    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ enabled: true, port: 45832 }));
    expect(await screen.findByText('Sharing enabled')).toBeInTheDocument();
    expect(screen.getByText('http://192.168.1.10:45832')).toBeInTheDocument();
  });
});

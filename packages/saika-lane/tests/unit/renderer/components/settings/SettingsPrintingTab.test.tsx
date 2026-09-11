// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsPrintingTab } from '@/renderer/presentation/components/settings/SettingsPrintingTab';
import { PrintSettingsSchema } from '@/shared/ipc/contracts';

const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), list: vi.fn() }));
vi.mock('@/renderer/services/settingsService', () => ({
  settingsService: { getAppSettings: mocks.get, savePrintSettings: mocks.save },
}));
vi.mock('@/renderer/services/reportService', () => ({ reportService: { listPrinters: mocks.list } }));

describe('SettingsPrintingTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.get.mockResolvedValue({ printing: PrintSettingsSchema.parse({}) });
    mocks.save.mockResolvedValue(undefined);
    mocks.list.mockResolvedValue([{ name: 'queue-1', displayName: 'Office printer' }]);
  });

  it('saves the selected queue and all options and restores them when reopened', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsPrintingTab />);
    await user.selectOptions(await screen.findByLabelText('Printer'), 'queue-1');
    await user.selectOptions(screen.getByLabelText('Paper Size'), 'Letter');
    await user.selectOptions(screen.getByLabelText('Orientation'), 'true');
    fireEvent.change(screen.getByLabelText('Copies'), { target: { value: '3' } });
    await user.selectOptions(screen.getByLabelText('Color'), 'true');
    await user.selectOptions(screen.getByLabelText('Two-sided Printing'), 'shortEdge');
    await user.click(screen.getByText('Save Printing Settings'));
    const saved = {
      deviceName: 'queue-1',
      pageSize: 'Letter',
      landscape: true,
      copies: 3,
      color: true,
      duplexMode: 'shortEdge',
    };
    expect(mocks.save).toHaveBeenCalledWith(saved);
    expect(await screen.findByRole('status')).toHaveTextContent('Printing settings saved.');
    unmount();
    mocks.get.mockResolvedValue({ printing: saved });
    render(<SettingsPrintingTab />);
    expect(await screen.findByLabelText('Printer')).toHaveValue('queue-1');
    expect(screen.getByLabelText('Copies')).toHaveValue(3);
  });

  it('retains a missing selection and lets the user return to Preview', async () => {
    mocks.get.mockResolvedValue({ printing: PrintSettingsSchema.parse({ deviceName: 'missing' }) });
    render(<SettingsPrintingTab />);
    expect(await screen.findByLabelText('Printer')).toHaveValue('missing');
    expect(screen.getByText('Save Printing Settings')).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Printer'), '');
    await userEvent.click(screen.getByText('Save Printing Settings'));
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ deviceName: '' }));
  });

  it('refreshes printers without discarding unsaved options and displays save failures', async () => {
    render(<SettingsPrintingTab />);
    await userEvent.selectOptions(await screen.findByLabelText('Printer'), 'queue-1');
    fireEvent.change(screen.getByLabelText('Copies'), { target: { value: '2' } });
    mocks.list.mockRejectedValueOnce(new Error('Printer service unavailable'));
    await userEvent.click(screen.getByText('Refresh Printers'));
    expect(await screen.findByText(/Failed to load printers/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Refresh Printers'));
    expect(screen.getByLabelText('Copies')).toHaveValue(2);
    mocks.save.mockRejectedValueOnce(new Error('Disk full'));
    await userEvent.click(screen.getByText('Save Printing Settings'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full');
    expect(screen.queryByText('Printing settings saved.')).not.toBeInTheDocument();
  });

  it('does not enable saving if settings could not be loaded', async () => {
    mocks.get.mockRejectedValue(new Error('Read failed'));
    render(<SettingsPrintingTab />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to load printing settings'));
    expect(screen.queryByText('Save Printing Settings')).not.toBeInTheDocument();
  });
});

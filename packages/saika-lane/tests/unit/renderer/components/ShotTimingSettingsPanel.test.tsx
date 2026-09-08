// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShotTimingSettingsPanel } from '@/renderer/presentation/components/settings/ShotTimingSettingsPanel';
import { timedTargetService } from '@/renderer/services/timedTargetService';
import { DEFAULT_TIMED_TARGET_TIMING_SETTINGS } from '@/shared/mqtt/TimedTargetTimingSettings';

vi.mock('@/renderer/services/timedTargetService', () => ({
  timedTargetService: {
    getTimingSettings: vi.fn(),
    setTimingSettings: vi.fn(),
  },
}));

describe('ShotTimingSettingsPanel', () => {
  beforeEach(() => {
    vi.mocked(timedTargetService.getTimingSettings).mockResolvedValue(DEFAULT_TIMED_TARGET_TIMING_SETTINGS);
    vi.mocked(timedTargetService.setTimingSettings).mockImplementation(async (input) => input);
  });

  it('keeps unknown bounds blank and saves measured values independently', async () => {
    render(<ShotTimingSettingsPanel />);
    const delay = await screen.findByLabelText('Maximum reception delay (ms)');
    expect(delay).toHaveValue(null);
    fireEvent.change(delay, { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Clock uncertainty (ms)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save shot timing' }));
    await screen.findByText('Shot timing saved.');
    expect(timedTargetService.setTimingSettings).toHaveBeenCalledWith({
      mode: 'BOUNDED',
      maximumReceiptDelayMilliseconds: 250,
      clockUncertaintyMilliseconds: 15,
    });
  });

  it('explains timestamp-only operation and shows save rejection without claiming success', async () => {
    vi.mocked(timedTargetService.setTimingSettings).mockRejectedValue(new Error('Finish the active competition'));
    render(<ShotTimingSettingsPanel />);
    fireEvent.change(await screen.findByLabelText('Timing assessment'), { target: { value: 'TIMESTAMP' } });
    expect(screen.getByLabelText('Maximum reception delay (ms)')).toBeDisabled();
    expect(screen.getByText('Reception delay and clock uncertainty will not be considered.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save shot timing' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Finish the active competition'));
    expect(screen.queryByText('Shot timing saved.')).not.toBeInTheDocument();
  });
});

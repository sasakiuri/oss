import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

const { getSettings, setSettings } = vi.hoisted(() => ({ getSettings: vi.fn(), setSettings: vi.fn() }));
vi.mock('@/renderer/services', () => ({
  mqttService: { getClockQualitySettings: getSettings, setClockQualitySettings: setSettings },
}));
import { ClockQualitySettingsPanel } from '@/renderer/presentation/features/settings/ClockQualitySettingsPanel';

describe('ClockQualitySettingsPanel', () => {
  it('loads the saved policy and sends independent edited tolerances', async () => {
    getSettings.mockResolvedValue({
      success: true,
      data: {
        mode: 'ADVISORY',
        maxAbsoluteOffsetMilliseconds: 250,
        maxUncertaintyMilliseconds: 100,
        maxSampleAgeMilliseconds: 300000,
      },
    });
    setSettings.mockImplementation(async (data) => ({ success: true, data }));
    render(<ClockQualitySettingsPanel />);
    fireEvent.change(await screen.findByLabelText('Clock policy'), { target: { value: 'REQUIRED' } });
    fireEvent.change(screen.getByLabelText('Maximum clock offset (ms)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save clock policy' }));
    await waitFor(() =>
      expect(setSettings).toHaveBeenCalledWith({
        mode: 'REQUIRED',
        maxAbsoluteOffsetMilliseconds: 25,
        maxUncertaintyMilliseconds: 100,
        maxSampleAgeMilliseconds: 300000,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Probe the Lanes again');
  });

  it('shows a failed load and a failed save as their messages', async () => {
    getSettings.mockResolvedValue(fail('Clock policy is unavailable'));
    const { unmount } = render(<ClockQualitySettingsPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Clock policy is unavailable$/);
    unmount();

    getSettings.mockResolvedValue(
      ok({
        mode: 'ADVISORY',
        maxAbsoluteOffsetMilliseconds: 250,
        maxUncertaintyMilliseconds: 100,
        maxSampleAgeMilliseconds: 300000,
      }),
    );
    setSettings.mockResolvedValue(fail('Clock policy was not saved', 'VALIDATION_ERROR'));
    render(<ClockQualitySettingsPanel />);
    await screen.findByLabelText('Clock policy');
    fireEvent.click(screen.getByRole('button', { name: 'Save clock policy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Clock policy was not saved$/);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save clock policy' })).toBeEnabled();
  });
});

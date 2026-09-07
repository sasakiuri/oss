import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
});

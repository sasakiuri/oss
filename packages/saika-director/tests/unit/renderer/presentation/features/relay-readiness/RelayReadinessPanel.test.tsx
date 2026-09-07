import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { assess, getStartSettings, setStartSettings } = vi.hoisted(() => ({
  assess: vi.fn(),
  getStartSettings: vi.fn(),
  setStartSettings: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({ relayReadinessService: { assess, getStartSettings, setStartSettings } }));
import { RelayReadinessPanel } from '@/renderer/presentation/features/relay-readiness/RelayReadinessPanel';

describe('RelayReadinessPanel', () => {
  it('shows the persisted start scope and explicitly binds Required mode to the displayed relay', async () => {
    let settings = { competitionId: 'competition-a', relayNumber: 1, mode: 'ADVISORY' };
    assess.mockImplementation(async () => ({
      success: true,
      data: { mode: settings.mode, ready: false, mayStart: settings.mode !== 'REQUIRED', items: [] },
    }));
    getStartSettings.mockImplementation(async () => ({ success: true, data: settings }));
    setStartSettings.mockImplementation(async (input) => {
      settings = input;
      return { success: true, data: input };
    });
    render(
      <RelayReadinessPanel
        competitionId="competition-a"
        relayNumber={2}
        phase="SIGHTING"
        lanes={[{ laneId: 'lane-a', label: 'Lane A' }]}
      />,
    );
    expect(await screen.findByText(/START uses relay 1/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Relay start checks'), { target: { value: 'REQUIRED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply start checks to relay 2' }));
    await waitFor(() =>
      expect(setStartSettings).toHaveBeenCalledWith({
        competitionId: 'competition-a',
        relayNumber: 2,
        mode: 'REQUIRED',
      }),
    );
    expect(await screen.findByText(/START uses relay 2 in required mode/)).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

const { assess, getStartSettings, setStartSettings, record } = vi.hoisted(() => ({
  assess: vi.fn(),
  getStartSettings: vi.fn(),
  setStartSettings: vi.fn(),
  record: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  relayReadinessService: { assess, getStartSettings, setStartSettings, record },
}));
import { RelayReadinessPanel } from '@/renderer/presentation/features/relay-readiness/RelayReadinessPanel';

const lanes = [{ laneId: 'lane-a', label: 'Lane A' }];
const item = {
  requirement: 'TARGET_MODE_CONFIRMED' as const,
  laneId: 'lane-a',
  phase: 'SIGHTING' as const,
  label: 'Target mode confirmed',
  ruleReference: 'ISSF 6.11',
  required: true,
  confirmed: false,
  latestEntry: null,
};

describe('RelayReadinessPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the persisted start scope and explicitly binds Required mode to the displayed relay', async () => {
    let settings = { competitionId: 'competition-a', relayNumber: 1, mode: 'ADVISORY' };
    assess.mockImplementation(async () =>
      ok({ mode: settings.mode, ready: false, mayStart: settings.mode !== 'REQUIRED', items: [] }),
    );
    getStartSettings.mockImplementation(async () => ok(settings));
    setStartSettings.mockImplementation(async (input) => {
      settings = input;
      return ok(input);
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

  it('shows a failed start-settings load and a failed assessment as their messages', async () => {
    assess.mockResolvedValue(ok({ mode: 'ADVISORY', ready: false, mayStart: true, items: [] }));
    getStartSettings.mockResolvedValue(fail('Start settings are unavailable'));
    const { unmount } = render(
      <RelayReadinessPanel competitionId="competition-a" relayNumber={1} phase="SIGHTING" lanes={lanes} />,
    );
    expect(await screen.findByText('Start settings are unavailable')).toBeInTheDocument();
    expect(screen.getByText(/policy … · checks outstanding/)).toBeInTheDocument();
    unmount();

    getStartSettings.mockResolvedValue(ok({ competitionId: 'competition-a', relayNumber: 1, mode: 'ADVISORY' }));
    assess.mockResolvedValue(fail('Relay assessment failed'));
    render(<RelayReadinessPanel competitionId="competition-a" relayNumber={1} phase="SIGHTING" lanes={lanes} />);
    expect(await screen.findByText('Relay assessment failed')).toBeInTheDocument();
    expect(screen.getByText(/START uses relay 1 in advisory mode/)).toBeInTheDocument();
  });

  it('shows failed start-settings and readiness records as their messages', async () => {
    assess.mockResolvedValue(ok({ mode: 'ADVISORY', ready: false, mayStart: true, items: [item] }));
    getStartSettings.mockResolvedValue(ok({ competitionId: 'competition-a', relayNumber: 1, mode: 'ADVISORY' }));
    setStartSettings.mockResolvedValue(fail('Relay 2 has already started', 'CONFLICT'));
    record.mockResolvedValue(fail('Official name is required', 'VALIDATION_ERROR'));
    render(<RelayReadinessPanel competitionId="competition-a" relayNumber={2} phase="SIGHTING" lanes={lanes} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply start checks to relay 2' }));
    expect(await screen.findByText('Relay 2 has already started')).toBeInTheDocument();
    expect(assess).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'Range Officer' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Official name is required')).toBeInTheDocument();
    expect(screen.queryByText('Relay 2 has already started')).not.toBeInTheDocument();
    expect(assess).toHaveBeenCalledTimes(1);
  });
});

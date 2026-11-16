import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RelayAthleteLifecyclePanel } from '@/renderer/presentation/features/relay-readiness/RelayAthleteLifecyclePanel';
import { relayAthleteLifecycleService } from '@/renderer/services';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);

const athletes = [
  { laneId: 'lane-a', laneLabel: 'Lane A', athleteId: 'athlete-a', athleteName: 'Alex Archer', athleteStartNumber: 7 },
];
const item = {
  requirement: 'ATHLETE_IDENTITY_BIB_VERIFIED' as const,
  laneId: 'lane-a',
  athleteId: 'athlete-a',
  phase: 'PRE_RELAY' as const,
  label: 'Identity and bib verified',
  ruleReference: 'ISSF 6.4',
  required: true,
  alternativeGroup: null,
  confirmed: false,
  latestEntry: null,
};

function renderPanel() {
  return render(
    <RelayAthleteLifecyclePanel
      competitionId="competition-a"
      relayNumber={1}
      preferredPhase="PRE_RELAY"
      athletes={athletes}
    />,
  );
}

describe('RelayAthleteLifecyclePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a failed assessment as its message', async () => {
    vi.mocked(relayAthleteLifecycleService.assess).mockResolvedValue(fail('Lifecycle assessment failed'));
    renderPanel();
    expect(await screen.findByText('Lifecycle assessment failed')).toBeInTheDocument();
    expect(screen.getByText(/policy … · checks outstanding/)).toBeInTheDocument();
  });

  it('shows a failed record as its message and keeps the assessment', async () => {
    vi.mocked(relayAthleteLifecycleService.assess).mockResolvedValue(
      ok({ mode: 'ADVISORY' as const, ready: false, mayProceed: true, items: [item] }),
    );
    vi.mocked(relayAthleteLifecycleService.record).mockResolvedValue(
      fail('Athlete is not assigned to this relay', 'VALIDATION_ERROR'),
    );
    renderPanel();
    expect(await screen.findByText('Identity and bib verified')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'Range Officer' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Athlete is not assigned to this relay')).toBeInTheDocument();
    expect(relayAthleteLifecycleService.assess).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });
});

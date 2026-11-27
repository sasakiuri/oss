// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimingProfilesPanel } from '@/renderer/presentation/components/settings/TimingProfilesPanel';
import { timedTargetService } from '@/renderer/services/timedTargetService';
import type { TimingProfileStatus } from '@/shared/ipc/contracts/timingProfiles.schema';

vi.mock('@/renderer/services/timedTargetService', () => ({
  timedTargetService: {
    getTimingProfiles: vi.fn(),
    saveTimingProfile: vi.fn(),
    applyTimingProfile: vi.fn(),
    recordTimingInstallation: vi.fn(),
  },
}));
const measured = { mode: 'BOUNDED' as const, maximumReceiptDelayMilliseconds: 180, clockUncertaintyMilliseconds: 8 };
const status: TimingProfileStatus = {
  revision: 'a'.repeat(64),
  connectionLabel: 'Target on COM3',
  state: 'MANUAL',
  issue: null,
  settings: measured,
  applications: [],
  activeApplicationId: null,
  profiles: [
    {
      id: 'profile',
      name: 'Measured target',
      installationReference: 'Serial-1 and cable A',
      measurementReference: 'Log M-001',
      measuredBy: 'Technician',
      measuredAt: '2026-09-08T00:00:00Z',
      recordedAt: '2026-09-08T00:00:00Z',
      settings: measured,
      connectionRevision: 'b'.repeat(64),
      connectionLabel: 'Target on COM3',
    },
  ],
};
describe('TimingProfilesPanel', () => {
  it('records a configuration change separately and shows when measured bounds require review', async () => {
    vi.mocked(timedTargetService.getTimingProfiles).mockResolvedValue(status);
    const settings = { ...measured, maximumReceiptDelayMilliseconds: null, clockUncertaintyMilliseconds: null };
    vi.mocked(timedTargetService.recordTimingInstallation).mockResolvedValue({
      ...status,
      settings,
      state: 'REVIEW_REQUIRED',
      issue: 'The installation record changed',
    });
    const onApplied = vi.fn();
    render(<TimingProfilesPanel settings={measured} onApplied={onApplied} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load measured timing profiles' }));
    await screen.findByLabelText('Timing official');
    fireEvent.click(screen.getByText('Record an equipment or clock setup change'));
    fireEvent.change(screen.getByLabelText('Timing official'), { target: { value: 'Officer' } });
    fireEvent.change(screen.getByLabelText('Current equipment and clock configuration'), {
      target: { value: 'Firmware 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record changed installation' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(settings));
    expect(timedTargetService.recordTimingInstallation).toHaveBeenCalledWith({
      expectedRevision: status.revision,
      description: 'Firmware 2',
      officialName: 'Officer',
    });
    expect(screen.getByText(/Timing mode: REVIEW REQUIRED/)).toBeVisible();
  });
  it('shows measured evidence and requires installation confirmation before applying the selected settings', async () => {
    vi.mocked(timedTargetService.getTimingProfiles).mockResolvedValue(status);
    vi.mocked(timedTargetService.applyTimingProfile).mockResolvedValue({ ...status, state: 'ACTIVE' });
    const onApplied = vi.fn();
    render(<TimingProfilesPanel settings={measured} onApplied={onApplied} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load measured timing profiles' }));
    fireEvent.change(await screen.findByLabelText('Timing profile'), { target: { value: 'profile' } });
    expect(screen.getByText('Evidence: Log M-001')).toBeVisible();
    const apply = screen.getByRole('button', { name: 'Apply selected timing profile' });
    fireEvent.change(screen.getByLabelText('Timing official'), { target: { value: 'Officer' } });
    expect(apply).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /I confirmed/ }));
    fireEvent.click(apply);
    await waitFor(() =>
      expect(timedTargetService.applyTimingProfile).toHaveBeenCalledWith({
        profileId: 'profile',
        expectedRevision: status.revision,
        installationConfirmed: true,
        officialName: 'Officer',
      }),
    );
    expect(await screen.findByText('Measured timing profile applied.')).toBeVisible();
    expect(onApplied).toHaveBeenCalledWith(measured);
  });
});

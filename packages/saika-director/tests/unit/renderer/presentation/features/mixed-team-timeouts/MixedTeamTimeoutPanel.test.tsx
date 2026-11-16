import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MixedTeamTimeoutPanel } from '@/renderer/presentation/features/mixed-team-timeouts/MixedTeamTimeoutPanel';
import { mixedTeamTimeoutsService } from '@/renderer/services';
import type { DirectorLaneSnapshotDto, MixedTeamTimeoutDto } from '@/shared/ipc/contracts';
import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const { list, start, close } = vi.mocked(mixedTeamTimeoutsService);

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const TIMEOUT_ID = '22222222-2222-4222-8222-222222222222';

function lane(laneId: string, teamId: string) {
  return {
    laneId,
    assignment: { athlete: { teamId, teamName: `Team ${teamId}` } },
    score: { totalShotCount: 18 },
  };
}
const lanes = [
  lane('33333333-3333-4333-8333-333333333333', 'A'),
  lane('44444444-4444-4444-8444-444444444444', 'A'),
  lane('55555555-5555-4555-8555-555555555555', 'B'),
  lane('66666666-6666-4666-8666-666666666666', 'B'),
] as unknown as DirectorLaneSnapshotDto[];

const active: MixedTeamTimeoutDto = {
  id: TIMEOUT_ID,
  competitionId: COMPETITION_ID,
  requestingTeamId: 'B',
  courtesyTeamIds: [],
  requestedByRole: 'COACH',
  requestedByName: 'Coach B',
  afterShot: 18,
  durationSeconds: 30,
  officialName: 'Jury A',
  statement: 'Timeout requested',
  startedAt: '2026-09-07T01:00:00.000Z',
  expiresAt: '2999-01-01T00:00:00.000Z',
  closedEntry: null,
  voidEntry: null,
  active: true,
};

describe('MixedTeamTimeoutPanel failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue(ok([]));
  });

  it('shows a failed list as the response message', async () => {
    list.mockResolvedValue(fail('Timeouts are unavailable'));
    render(<MixedTeamTimeoutPanel competitionId={COMPETITION_ID} lanes={lanes} />);
    expect(await screen.findByText('Timeouts are unavailable')).toBeInTheDocument();
  });

  it('shows a failed start as the response message and a rejected start as text', async () => {
    start.mockResolvedValueOnce(fail('Team A has used its request'));
    start.mockRejectedValueOnce('Director storage is busy');
    render(<MixedTeamTimeoutPanel competitionId={COMPETITION_ID} lanes={lanes} />);
    fireEvent.change(await screen.findByLabelText('Requester name'), { target: { value: 'Coach A' } });
    fireEvent.change(screen.getByLabelText('Jury official'), { target: { value: 'Jury A' } });
    const startButton = screen.getByRole('button', { name: 'Start 30-second timeout' });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);
    expect(await screen.findByText('Team A has used its request')).toBeInTheDocument();
    expect(list).toHaveBeenCalledOnce();

    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);
    expect(await screen.findByText('Director storage is busy')).toBeInTheDocument();
    expect(start).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestingTeamId: 'A', requestedByName: 'Coach A', afterShot: 18 }),
    );
  });

  it('shows a failed close as the response message', async () => {
    list.mockResolvedValue(ok([active]));
    close.mockResolvedValue(fail('The timeout is already closed'));
    render(<MixedTeamTimeoutPanel competitionId={COMPETITION_ID} lanes={lanes} />);
    fireEvent.change(screen.getByLabelText('Jury official'), { target: { value: 'Jury A' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Announce Time / close' }));
    expect(await screen.findByText('The timeout is already closed')).toBeInTheDocument();
    expect(close).toHaveBeenCalledWith({
      timeoutId: TIMEOUT_ID,
      officialName: 'Jury A',
      statement: 'Timeout requested after completed round; Jury timing started',
    });
  });
});

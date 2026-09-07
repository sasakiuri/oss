// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReserveLaneTransferPanel } from '@/renderer/presentation/features/range-interruptions/ReserveLaneTransferPanel';

const { workspace, complete } = vi.hoisted(() => ({ workspace: vi.fn(), complete: vi.fn() }));
vi.mock('@/renderer/services', () => ({ reserveLaneTransfersService: { workspace, complete } }));

describe('ReserveLaneTransferPanel', () => {
  it('shows the frozen evidence and requires confirmation before completing a prepared transfer', async () => {
    const request = {
      id: 'transfer',
      competitionId: 'competition',
      sourceLaneId: 'source',
      destinationLaneId: 'target',
      officialName: 'Jury',
      statement: 'IR 12',
    };
    workspace.mockResolvedValue({
      success: true,
      data: [
        {
          request,
          entries: [{ operation: 'SOURCE_PREPARED' }],
          bundle: {
            request,
            digest: 'snapshot-digest',
            summary: { athleteName: 'Alex', matchShots: 14, totalScoreX10: 1437, remainingSeconds: 240 },
          },
        },
      ],
    });
    complete.mockResolvedValue({ success: true });
    render(
      <ReserveLaneTransferPanel
        competitionId="competition"
        lanes={[
          { laneId: 'source', label: 'Firing point 1' },
          { laneId: 'target', label: 'Firing point 2' },
        ]}
      />,
    );
    fireEvent.click(screen.getByText('Reserve Lane transfer'));
    const apply = await screen.findByRole('button', { name: 'Complete or retry transfer' });
    expect(apply).toBeDisabled();
    expect(screen.getByText(/Alex · 14 MATCH shots · 143.7 points · 240s remaining/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /confirm the athlete/ }));
    fireEvent.click(apply);
    await waitFor(() =>
      expect(complete).toHaveBeenCalledWith({ id: 'transfer', expectedDigest: 'snapshot-digest', confirmed: true }),
    );
    expect(screen.queryByRole('button', { name: 'Apply or retry recorded resume grant' })).not.toBeInTheDocument();
  });
});

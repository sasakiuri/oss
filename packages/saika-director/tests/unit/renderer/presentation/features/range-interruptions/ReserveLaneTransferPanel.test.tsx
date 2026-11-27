// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReserveLaneTransferPanel } from '@/renderer/presentation/features/range-interruptions/ReserveLaneTransferPanel';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

const { workspace, prepare, cancel, complete, resume, resumeMatch } = vi.hoisted(() => ({
  workspace: vi.fn(),
  prepare: vi.fn(),
  cancel: vi.fn(),
  complete: vi.fn(),
  resume: vi.fn(),
  resumeMatch: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  reserveLaneTransfersService: { workspace, prepare, cancel, complete, resume, resumeMatch },
}));

const request = {
  id: 'transfer',
  competitionId: 'competition',
  sourceLaneId: 'source',
  destinationLaneId: 'target',
  officialName: 'Jury',
  statement: 'IR 12',
};
const bundle = {
  request,
  digest: 'snapshot-digest',
  summary: { athleteName: 'Alex', matchShots: 14, totalScoreX10: 1437, remainingSeconds: 240 },
};
const grant = {
  id: 'grant',
  transferId: 'transfer',
  remainingSeconds: 540,
  unlimitedSightingShots: true,
  officialName: 'Jury',
  statement: 'IR 12',
};
const lanes = [
  { laneId: 'source', label: 'Firing point 1' },
  { laneId: 'target', label: 'Firing point 2' },
];

function renderOpen() {
  const view = render(<ReserveLaneTransferPanel competitionId="competition" lanes={lanes} />);
  fireEvent.click(screen.getByText('Reserve Lane transfer'));
  return view;
}

function identifyOfficial() {
  fireEvent.change(screen.getByLabelText('Transfer / resume official'), { target: { value: 'Jury B' } });
  fireEvent.change(screen.getByLabelText('Decision / IR reference'), { target: { value: 'IR 13' } });
}

describe('ReserveLaneTransferPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the frozen evidence and requires confirmation before completing a prepared transfer', async () => {
    workspace.mockResolvedValue(ok([{ request, entries: [{ operation: 'SOURCE_PREPARED' }], bundle }]));
    complete.mockResolvedValue({ success: true });
    renderOpen();
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

  it('shows a failed load as the response message and a rejected load as the load fallback', async () => {
    workspace.mockResolvedValue(fail('Transfer ledger unavailable'));
    const { unmount } = renderOpen();
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Transfer ledger unavailable$/);
    unmount();

    workspace.mockResolvedValue({ success: false });
    const second = renderOpen();
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Reserve transfer failed$/);
    second.unmount();

    workspace.mockRejectedValue('offline');
    renderOpen();
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Unable to load transfers$/);
  });

  it('shows a failed preparation, retry and cancellation as the response message', async () => {
    workspace.mockResolvedValue(ok([{ request, entries: [{ operation: 'FAILED' }], bundle: null }]));
    prepare.mockResolvedValue(fail('The source Lane is not under safety STOP'));
    cancel.mockResolvedValue(fail('The transfer is already retired'));
    renderOpen();

    fireEvent.click(await screen.findByRole('button', { name: 'Retry source snapshot' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^The source Lane is not under safety STOP$/);
    expect(prepare).toHaveBeenCalledWith(request);

    prepare.mockResolvedValue(fail('The reserve Lane has shots'));
    fireEvent.change(screen.getByLabelText(/^Source Lane/), { target: { value: 'source' } });
    fireEvent.change(screen.getByLabelText(/^Reserve Lane/), { target: { value: 'target' } });
    identifyOfficial();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Prepare source snapshot' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Prepare source snapshot' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^The reserve Lane has shots$/));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Cancel preparation using the official and reason above' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel preparation using the official and reason above' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^The transfer is already retired$/));
  });

  it('shows a failed completion as the response message, the response fallback or the command fallback', async () => {
    workspace.mockResolvedValue(ok([{ request, entries: [{ operation: 'SOURCE_PREPARED' }], bundle }]));
    complete.mockResolvedValue(fail('The snapshot digest changed'));
    renderOpen();
    const apply = await screen.findByRole('button', { name: 'Complete or retry transfer' });
    fireEvent.click(screen.getByRole('checkbox', { name: /confirm the athlete/ }));
    fireEvent.click(apply);
    expect(await screen.findByRole('alert')).toHaveTextContent(/^The snapshot digest changed$/);

    complete.mockResolvedValue({ success: false });
    await waitFor(() => expect(apply).toBeEnabled());
    fireEvent.click(apply);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^Reserve transfer failed$/));

    complete.mockRejectedValue('socket closed');
    await waitFor(() => expect(apply).toBeEnabled());
    fireEvent.click(apply);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^Transfer failed$/));
  });

  it('shows a failed resume as the response message', async () => {
    workspace.mockResolvedValue(
      ok([
        {
          request,
          entries: [{ operation: 'TARGET_ACTIVE' }, { operation: 'RESUME_AUTHORIZED', detail: grant }],
          bundle,
        },
      ]),
    );
    resume.mockResolvedValue(fail('The reserve Lane is not ready'));
    renderOpen();
    const apply = await screen.findByRole('button', { name: 'Apply or retry recorded resume grant' });
    identifyOfficial();
    fireEvent.click(apply);
    expect(await screen.findByRole('alert')).toHaveTextContent(/^The reserve Lane is not ready$/);
    expect(resume).toHaveBeenCalledWith(grant);
  });

  it('shows a failed MATCH resume as the response message', async () => {
    workspace.mockResolvedValue(
      ok([
        {
          request,
          entries: [
            { operation: 'TARGET_ACTIVE' },
            { operation: 'RESUME_AUTHORIZED', detail: grant },
            { operation: 'RESUMED' },
          ],
          bundle,
        },
      ]),
    );
    resumeMatch.mockResolvedValue(fail('The sighting period is still running'));
    renderOpen();
    fireEvent.click(await screen.findByRole('button', { name: 'End extra sighting and resume MATCH' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^The sighting period is still running$/);
    expect(resumeMatch).toHaveBeenCalledWith({ id: 'transfer' });
  });
});

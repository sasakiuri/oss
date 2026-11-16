import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FinalRecoveryFiringPanel } from '@/renderer/presentation/features/final-recoveries/FinalRecoveryFiringPanel';
import type { FinalRecoveryCaseDto } from '@/shared/ipc/contracts';
import { fail } from '../../../../../helpers/renderer/serviceResponses';
const { list, start, read, cancel } = vi.hoisted(() => ({
  list: vi.fn(),
  start: vi.fn(),
  read: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({ finalRecoveryFiringService: { list, start, read, cancel } }));
const value = {
  id: 'case',
  affectedLaneIds: ['lane'],
  procedureProfile: 'PISTOL_25M_WOMEN',
  phase: 'MATCH_SERIES',
  status: 'RECOVERY_AUTHORIZED',
  entries: [{ id: 'authorization', type: 'REMEDY_AUTHORIZED' }],
} as FinalRecoveryCaseDto;
describe('FinalRecoveryFiringPanel', () => {
  it('requires readiness confirmation and does not start firing while reading the ledger', async () => {
    list.mockResolvedValue({ success: true, data: [] });
    start.mockResolvedValue({ success: true });
    render(<FinalRecoveryFiringPanel value={value} disabled={false} />);
    await waitFor(() => expect(list).toHaveBeenCalledWith({ caseId: 'case' }));
    const button = screen.getByRole('button', { name: 'Start isolated firing' });
    expect(button).toBeDisabled();
    expect(start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(button);
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: 'case', authorizationId: 'authorization', laneId: 'lane' }),
      ),
    );
    expect(cancel).not.toHaveBeenCalled();
  });

  it('shows a failed ledger load as the response message', async () => {
    list.mockResolvedValue(fail('Recovery firing ledger unavailable'));
    render(<FinalRecoveryFiringPanel value={value} disabled={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Recovery firing ledger unavailable$/);
  });

  it('shows a failed command as its message or the fallback text, and a failed reload after it', async () => {
    const run = {
      intent: { id: 'run', authorizationId: 'other', laneId: 'lane', loadAt: '2026-09-07T00:00:10.000Z' },
      request: { shotsToFire: 2 },
      evidence: null,
    };
    list.mockResolvedValue({ success: true, data: [run] });
    start.mockResolvedValue(fail('The Lane is not under safety STOP'));
    read.mockResolvedValue({ success: false });
    render(<FinalRecoveryFiringPanel value={value} disabled={false} />);
    const readButton = await screen.findByRole('button', { name: 'Read Lane evidence' });

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Start isolated firing' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^The Lane is not under safety STOP$/);

    await waitFor(() => expect(readButton).toBeEnabled());
    fireEvent.click(readButton);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^Operation failed$/));

    cancel.mockRejectedValue('Lane bridge closed');
    fireEvent.change(screen.getByLabelText('Recovery cancellation reason'), { target: { value: 'Jury stop' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel firing' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel firing' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^Lane bridge closed$/));

    list.mockResolvedValue(fail('The ledger reload failed'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry same firing' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Retry same firing' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^The ledger reload failed$/));
    expect(start).toHaveBeenLastCalledWith(run.intent);
  });
});

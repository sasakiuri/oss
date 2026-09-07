import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FinalRecoveryFiringPanel } from '@/renderer/presentation/features/final-recoveries/FinalRecoveryFiringPanel';
import type { FinalRecoveryCaseDto } from '@/shared/ipc/contracts';
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
});

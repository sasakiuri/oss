import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultVerificationPanel } from '@/renderer/presentation/features/championship/components/ResultVerificationPanel';
import type { ResultVerificationStatusDto } from '@/shared/ipc/contracts';

const { getStatus, approve } = vi.hoisted(() => ({ getStatus: vi.fn(), approve: vi.fn() }));
vi.mock('@/renderer/services', () => ({ resultVerificationService: { getStatus, approve } }));

describe('ResultVerificationPanel signing', () => {
  it('captures external approval evidence independently of result comparison evidence and resets after approval', async () => {
    const status: ResultVerificationStatusDto = {
      eventId: 'event',
      resultScope: 'QUALIFICATION',
      snapshotRevision: 'a'.repeat(64),
      configuredIndividualChecks: 0,
      configuredTeamChecks: 0,
      requiredIndividualChecks: 0,
      requiredTeamChecks: 0,
      teamVerificationSupported: true,
      checkedIndividualResults: 0,
      checkedTeamResults: 0,
      teamVerificationRunId: null,
      allResultsConfirmed: true,
      readyForApproval: true,
      issues: [],
      results: [],
      currentApproval: null,
      approvalHistory: [],
    };
    getStatus.mockImplementation(async () => ({ success: true, data: { ...status } }));
    approve.mockImplementation(async () => {
      const entry = {
        id: 'approval',
        eventId: 'event',
        resultScope: 'QUALIFICATION' as const,
        type: 'APPROVAL' as const,
        snapshotRevision: status.snapshotRevision,
        requiredIndividualChecks: 0,
        requiredTeamChecks: 0,
        checkIds: [],
        statement: 'Approved',
        officialName: 'External Jury',
        recordedAt: '2026-09-08T12:00:00Z',
        reversesApprovalId: null,
        active: true,
        current: true,
        signingEvidence: {
          method: 'EXTERNAL' as const,
          actorId: null,
          recordedBy: 'Signed-in recorder',
          evidenceReference: 'Signed form 12',
        },
      };
      status.currentApproval = entry;
      status.approvalHistory = [entry];
      return { success: true, data: entry };
    });
    render(<ResultVerificationPanel eventId="event" resultScope="QUALIFICATION" onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText('Approving RTS Jury member'), { target: { value: 'External Jury' } });
    fireEvent.change(screen.getByLabelText('Signature method'), { target: { value: 'EXTERNAL' } });
    expect(screen.getByRole('button', { name: 'Approve this result-list revision' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Signed form / signature evidence reference'), {
      target: { value: 'Signed form 12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve this result-list revision' }));
    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith(
        expect.objectContaining({
          officialName: 'External Jury',
          method: 'EXTERNAL',
          evidenceReference: 'Signed form 12',
        }),
      ),
    );
    expect(approve.mock.calls[0]![0]).not.toHaveProperty('recordedBy');
    expect(await screen.findByText(/EXTERNAL.*recorded by Signed-in recorder.*Signed form 12/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke approval' }));
    expect(screen.getByLabelText('Signature method')).toHaveValue('SELF');
    fireEvent.change(screen.getByLabelText('Signature method'), { target: { value: 'EXTERNAL' } });
    expect(screen.getByLabelText('Signed form / signature evidence reference')).toHaveValue('');
  });
});

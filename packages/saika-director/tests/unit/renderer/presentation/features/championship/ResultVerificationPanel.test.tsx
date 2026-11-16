import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultVerificationPanel } from '@/renderer/presentation/features/championship/components/ResultVerificationPanel';
import type { ResultVerificationStatusDto } from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

const { getStatus, addCheck, approve, revokeApproval } = vi.hoisted(() => ({
  getStatus: vi.fn(),
  addCheck: vi.fn(),
  approve: vi.fn(),
  revokeApproval: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  resultVerificationService: { getStatus, addCheck, approve, revokeApproval },
}));

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

describe('ResultVerificationPanel errors', () => {
  const baseStatus: ResultVerificationStatusDto = {
    eventId: 'event',
    resultScope: 'QUALIFICATION',
    snapshotRevision: 'a'.repeat(64),
    configuredIndividualChecks: 1,
    configuredTeamChecks: 0,
    requiredIndividualChecks: 1,
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
  const result: ResultVerificationStatusDto['results'][number] = {
    entryStatus: null,
    resultId: 'result',
    participantId: 'participant',
    revision: 'b'.repeat(64),
    rank: 1,
    playerName: 'Athlete A',
    affiliation: 'JPN',
    relayNumber: 1,
    totalScore: 630.1,
    classificationCode: null,
    decisionCount: 0,
    projectionIssues: [],
    status: 'confirmed',
    evidenceSummary: {
      expectedShots: 60,
      linkedShots: 60,
      independentDecimalShots: 60,
      innerTenClassifiedShots: 0,
      scoreConflicts: 0,
    },
    required: true,
    latestCheck: null,
    currentCheck: null,
  };

  it('shows a failed status load as its message or the fallback text', async () => {
    getStatus.mockResolvedValueOnce(fail('Event not found'));
    const { unmount } = render(
      <ResultVerificationPanel eventId="event" resultScope="QUALIFICATION" onClose={() => {}} />,
    );
    expect(await screen.findByText('Event not found')).toBeVisible();
    unmount();

    getStatus.mockRejectedValueOnce('offline');
    render(<ResultVerificationPanel eventId="event" resultScope="QUALIFICATION" onClose={() => {}} />);
    expect(await screen.findByText('Failed to load result verification status')).toBeVisible();
  });

  it('shows failed checks and approvals as their messages or the fallback texts', async () => {
    getStatus.mockResolvedValue(ok({ ...baseStatus, results: [result] }));
    addCheck.mockResolvedValueOnce(fail('The result changed; review it again')).mockRejectedValueOnce('offline');
    approve.mockResolvedValueOnce(fail('Approval requirements are not met')).mockRejectedValueOnce('offline');
    render(<ResultVerificationPanel eventId="event" resultScope="QUALIFICATION" onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText('Source reference / printout ID'), {
      target: { value: 'Printout 7' },
    });
    fireEvent.change(screen.getByLabelText('RTS Jury member'), { target: { value: 'Jury A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Append verification check' }));
    expect(await screen.findByText('The result changed; review it again')).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Append verification check' }));
    expect(await screen.findByText('Failed to append the verification check')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Approving RTS Jury member'), { target: { value: 'Jury A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve this result-list revision' }));
    expect(await screen.findByText('Approval requirements are not met')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Approve this result-list revision' }));
    expect(await screen.findByText('Failed to approve the result list')).toBeVisible();
  });

  it('shows a failed revocation as its message or the fallback text', async () => {
    const approval = {
      id: 'approval',
      eventId: 'event',
      resultScope: 'QUALIFICATION' as const,
      type: 'APPROVAL' as const,
      snapshotRevision: baseStatus.snapshotRevision,
      requiredIndividualChecks: 0,
      requiredTeamChecks: 0,
      checkIds: [],
      statement: 'Approved',
      officialName: 'Jury A',
      recordedAt: '2026-09-08T12:00:00Z',
      reversesApprovalId: null,
      active: true,
      current: true,
      signingEvidence: null,
    };
    getStatus.mockResolvedValue(ok({ ...baseStatus, currentApproval: approval, approvalHistory: [approval] }));
    revokeApproval.mockResolvedValueOnce(fail('The approval is no longer current')).mockRejectedValueOnce('offline');
    render(<ResultVerificationPanel eventId="event" resultScope="QUALIFICATION" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke approval' }));
    fireEvent.change(screen.getByLabelText('Revoking RTS Jury member'), { target: { value: 'Jury A' } });
    fireEvent.change(screen.getByLabelText('Approval revocation reason'), { target: { value: 'Wrong revision' } });
    fireEvent.click(screen.getByRole('button', { name: 'Append revocation' }));
    expect(await screen.findByText('The approval is no longer current')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Append revocation' }));
    expect(await screen.findByText('Failed to revoke the result-list approval')).toBeVisible();
  });
});

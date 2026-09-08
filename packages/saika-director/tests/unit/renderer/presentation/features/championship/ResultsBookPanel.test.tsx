import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultsBookPanel } from '@/renderer/presentation/features/championship/components/ResultsBookPanel';
import type { ResultsBookWorkspaceDto } from '@/shared/ipc/contracts';

const { getWorkspace, signBook, getSigningAccounts } = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  signBook: vi.fn(),
  getSigningAccounts: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  resultsBooksService: { getWorkspace, signBook },
  operatorAccessService: { getSigningAccounts },
}));

describe('ResultsBookPanel signing', () => {
  it('requires external evidence and displays the separate recorder returned by the service', async () => {
    const signer = { appointmentId: 'appointment', role: 'TECHNICAL_DELEGATE' as const, officialName: 'Delegate' };
    const workspace: ResultsBookWorkspaceDto = {
      officials: [],
      eligibleRecordResults: [],
      recordClaims: [],
      books: [
        {
          id: 'book',
          championshipId: 'championship',
          versionNumber: 1,
          sourceHash: 'a'.repeat(64),
          findings: [],
          requiredSigners: [signer],
          signatures: [],
          createdBy: 'Recorder',
          createdAt: '2026-09-08T12:00:00Z',
          status: 'DRAFT',
          finalizedAt: null,
        },
      ],
    };
    getWorkspace.mockResolvedValue({ success: true, data: workspace });
    getSigningAccounts.mockResolvedValue({ success: true, data: [] });
    signBook.mockImplementation(async () => ({
      success: true,
      data: {
        ...workspace,
        books: [
          {
            ...workspace.books[0],
            signatures: [
              {
                ...signer,
                id: 'signature',
                statement: 'Checked',
                signedAt: '2026-09-08T12:00:00Z',
                signingEvidence: {
                  method: 'EXTERNAL',
                  actorId: null,
                  recordedBy: 'Recorder',
                  evidenceReference: 'Signed form 5',
                },
              },
            ],
          },
        ],
      },
    }));
    render(<ResultsBookPanel championshipId="championship" />);
    await screen.findByRole('button', { name: 'Sign' });
    fireEvent.change(screen.getByLabelText('Signature method'), { target: { value: 'EXTERNAL' } });
    expect(screen.getByRole('button', { name: 'Record signature' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Signed document / evidence reference'), {
      target: { value: 'Signed form 5' },
    });
    fireEvent.change(screen.getByLabelText('Recorded by (uses signed-in operator when available)'), {
      target: { value: 'Recorder' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record signature' }));
    await waitFor(() =>
      expect(signBook).toHaveBeenCalledWith(
        expect.objectContaining({
          bookId: 'book',
          appointmentId: 'appointment',
          method: 'EXTERNAL',
          recordedBy: 'Recorder',
          evidenceReference: 'Signed form 5',
        }),
      ),
    );
    expect(await screen.findByText(/Delegate.*EXTERNAL.*recorded by Recorder.*Signed form 5/)).toBeInTheDocument();
  });
});

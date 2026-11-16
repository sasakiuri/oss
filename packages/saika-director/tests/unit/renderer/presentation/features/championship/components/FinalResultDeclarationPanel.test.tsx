import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FinalResultDeclarationPanel } from '@/renderer/presentation/features/championship/components/FinalResultDeclarationPanel';
import { resultPublicationService } from '@/renderer/services';

import { fail, ok } from '../../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../../helpers/renderer/mockServices')).mockServices(),
);
vi.mock('@/renderer/presentation/features/observation-reviews/ObservationReviewsPanel', () => ({
  ObservationReviewsPanel: () => null,
}));

describe('FinalResultDeclarationPanel', () => {
  it('shows a failed status load as its message or the fallback text', async () => {
    vi.mocked(resultPublicationService.getFinalDeclarationStatus).mockResolvedValueOnce(fail('Event not found'));
    const { unmount } = render(<FinalResultDeclarationPanel eventId="event" onClose={() => {}} />);
    expect(await screen.findByText('Event not found')).toBeVisible();
    unmount();

    vi.mocked(resultPublicationService.getFinalDeclarationStatus).mockRejectedValueOnce('offline');
    render(<FinalResultDeclarationPanel eventId="event" onClose={() => {}} />);
    expect(await screen.findByText('Failed to load the Final declaration status')).toBeVisible();
  });

  it('shows a failed declaration as its message or the fallback text', async () => {
    vi.mocked(resultPublicationService.getFinalDeclarationStatus).mockResolvedValue(
      ok({
        eventId: 'event',
        currentSnapshotRevision: 'a'.repeat(64),
        currentApprovalId: 'approval',
        declaration: null,
        declarationCurrent: false,
        canDeclare: true,
        issues: [],
      }),
    );
    vi.mocked(resultPublicationService.declareFinal)
      .mockResolvedValueOnce(fail('The Final result changed'))
      .mockRejectedValueOnce('offline');
    render(<FinalResultDeclarationPanel eventId="event" onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText('CRO / responsible official'), { target: { value: 'CRO' } });
    fireEvent.click(screen.getByLabelText(/All immediate Final protests have been decided/));
    fireEvent.click(screen.getByLabelText(/The RTS result process, ranks/));
    fireEvent.click(screen.getByRole('button', { name: 'Declare RESULTS ARE FINAL' }));
    expect(await screen.findByText('The Final result changed')).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Declare RESULTS ARE FINAL' }));
    expect(await screen.findByText('Failed to declare Final results')).toBeVisible();
  });
});

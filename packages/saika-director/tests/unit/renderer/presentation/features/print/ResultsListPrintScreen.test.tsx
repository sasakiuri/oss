import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResultsListPrintScreen } from '@/renderer/presentation/features/print/ResultsListPrintScreen';
import {
  championshipService,
  resultPublicationService,
  resultVerificationService,
  resultsService,
} from '@/renderer/services';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);

const EVENT_ID = '11111111-1111-4111-8111-111111111111';

function mockQualificationResponses() {
  vi.mocked(resultsService.getByEvent).mockResolvedValue(ok({ eventId: EVENT_ID, results: [] }));
  vi.mocked(championshipService.getParticipants).mockResolvedValue(ok({ participants: [] }));
  vi.mocked(championshipService.getFiringPointAssignments).mockResolvedValue(ok({ assignments: [] }));
  vi.mocked(championshipService.getCompetitionTypes).mockResolvedValue(ok({ types: [] }));
  vi.mocked(resultPublicationService.getStatus).mockResolvedValue(
    ok({ status: 'DRAFT', postedAt: null, protestEndsAt: null, publicationCurrent: false }) as never,
  );
  vi.mocked(resultVerificationService.getStatus).mockResolvedValue(ok({ currentApproval: null }) as never);
}

describe('ResultsListPrintScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a failed Final results load as its message, and the fallback text when the failure has none', async () => {
    vi.mocked(resultsService.getFinalByEvent).mockResolvedValueOnce(fail('Final results are unavailable'));
    const { unmount } = render(
      <ResultsListPrintScreen config={{ type: 'results-list-print', eventId: EVENT_ID, round: 'Final' }} />,
    );
    expect(await screen.findByText('Final results are unavailable')).toBeInTheDocument();
    unmount();

    vi.mocked(resultsService.getFinalByEvent).mockResolvedValueOnce({ success: false, data: null } as never);
    render(<ResultsListPrintScreen config={{ type: 'results-list-print', eventId: EVENT_ID, round: 'Final' }} />);
    expect(await screen.findByText('Failed to retrieve results')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it.each([
    ['results', () => vi.mocked(resultsService.getByEvent)],
    ['participants', () => vi.mocked(championshipService.getParticipants)],
    ['firing-point assignments', () => vi.mocked(championshipService.getFiringPointAssignments)],
    ['competition types', () => vi.mocked(championshipService.getCompetitionTypes)],
    ['publication status', () => vi.mocked(resultPublicationService.getStatus)],
    ['verification status', () => vi.mocked(resultVerificationService.getStatus)],
  ])('shows a failed qualification %s load as its message', async (name, method) => {
    mockQualificationResponses();
    method().mockResolvedValueOnce(fail(`The ${name} are unavailable`));
    render(<ResultsListPrintScreen config={{ type: 'results-list-print', eventId: EVENT_ID }} />);
    expect(await screen.findByText(`The ${name} are unavailable`)).toBeInTheDocument();
  });

  it('shows the fallback text when a failed qualification results load has no message', async () => {
    mockQualificationResponses();
    vi.mocked(resultsService.getByRelay).mockResolvedValueOnce({ success: false, data: null } as never);
    render(<ResultsListPrintScreen config={{ type: 'results-list-print', eventId: EVENT_ID, relayNumber: 2 }} />);
    expect(await screen.findByText('Failed to retrieve results')).toBeInTheDocument();
    expect(resultsService.getByRelay).toHaveBeenCalledWith({ eventId: EVENT_ID, relayNumber: 2 });
  });
});

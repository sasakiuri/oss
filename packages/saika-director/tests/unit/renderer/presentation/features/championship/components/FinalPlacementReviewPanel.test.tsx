import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FinalPlacementReviewPanel } from '@/renderer/presentation/features/championship/components/FinalPlacementReviewPanel';
import { finalPlacementReviewService } from '@/renderer/services';
import type { FinalPlacementReviewStatusDto } from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../../helpers/renderer/mockServices')).mockServices(),
);

const result: FinalPlacementReviewStatusDto['results'][number] = {
  id: 'result',
  participantId: 'participant',
  sourceRank: 1,
  rank: 1,
  playerName: 'Athlete A',
  affiliation: 'JPN',
  firingPointNumber: 1,
  stage1Shots: [],
  stage1Total: 0,
  stage2Shots: [],
  stage2Total: 0,
  seriesScores: [],
  seriesShotCounts: [],
  baseTotalScore: 250.1,
  totalScore: 250.1,
  scoreAdjustment: 0,
  deductionTotal: 0,
  classificationCode: null,
  decisionCount: 0,
  projectionIssues: [],
  scoringRevision: 'a'.repeat(64),
  placementReviewId: null,
  placementReviewRequired: true,
  remarks: '',
  status: 'finished',
};

const review: NonNullable<FinalPlacementReviewStatusDto['currentReview']> = {
  id: 'review',
  eventId: 'event',
  type: 'REVIEW',
  scoringRevision: 'a'.repeat(64),
  placements: [{ resultId: 'result', participantId: 'participant', rank: 1 }],
  ruleReference: '6.17',
  statement: 'Reviewed',
  officialName: 'Jury A',
  recordedAt: '2026-09-09T10:00:00.000Z',
  reversesReviewId: null,
  active: true,
  current: true,
};

const status: FinalPlacementReviewStatusDto = {
  eventId: 'event',
  scoringRevision: 'a'.repeat(64),
  reviewRequired: true,
  issues: [],
  results: [result],
  currentReview: null,
  reviewHistory: [],
};

function renderPanel() {
  return render(<FinalPlacementReviewPanel eventId="event" onClose={() => {}} onChanged={() => {}} />);
}

describe('FinalPlacementReviewPanel', () => {
  it('shows a failed status load as its message or the fallback text', async () => {
    vi.mocked(finalPlacementReviewService.getStatus).mockResolvedValueOnce(fail('Event not found'));
    const { unmount } = renderPanel();
    expect(await screen.findByText('Event not found')).toBeVisible();
    unmount();

    vi.mocked(finalPlacementReviewService.getStatus).mockRejectedValueOnce('offline');
    renderPanel();
    expect(await screen.findByText('Failed to load Final placement review')).toBeVisible();
  });

  it('shows a failed review as its message or the fallback text', async () => {
    vi.mocked(finalPlacementReviewService.getStatus).mockResolvedValue(ok(status));
    vi.mocked(finalPlacementReviewService.record)
      .mockResolvedValueOnce(fail('Final ranks must be unique'))
      .mockRejectedValueOnce('offline');
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Official / Jury member'), { target: { value: 'Jury A' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Record Final placement review' }));
    expect(await screen.findByText('Final ranks must be unique')).toBeVisible();
    fireEvent.submit(screen.getByRole('form', { name: 'Record Final placement review' }));
    expect(await screen.findByText('Failed to record Final placement review')).toBeVisible();
  });

  it('shows a failed revocation as its message or the fallback text', async () => {
    vi.mocked(finalPlacementReviewService.getStatus).mockResolvedValue(
      ok({ ...status, currentReview: review, reviewHistory: [review] }),
    );
    vi.mocked(finalPlacementReviewService.revoke)
      .mockResolvedValueOnce(fail('The review was already revoked'))
      .mockRejectedValueOnce('offline');
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Official / Jury member'), { target: { value: 'Jury A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke current review' }));
    fireEvent.change(screen.getByLabelText('Revocation reason'), { target: { value: 'Wrong rank' } });
    fireEvent.click(screen.getByRole('button', { name: 'Append revocation' }));
    expect(await screen.findByText('The review was already revoked')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Append revocation' }));
    expect(await screen.findByText('Failed to revoke Final placement review')).toBeVisible();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ObservationReviewsPanel } from '@/renderer/presentation/features/observation-reviews/ObservationReviewsPanel';
import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';
const api = vi.hoisted(() => ({ list: vi.fn(), listEvent: vi.fn(), record: vi.fn() }));
vi.mock('@/renderer/services', () => ({ observationReviewsService: api }));
const subject = {
  id: 'observation:e1',
  competitionId: 'competition',
  laneId: 'lane',
  kind: 'QUARANTINED_TIMING_REVIEW',
  occurredAt: '2026-09-09T00:00:00Z',
  detail: 'Unknown timing',
  evidenceReference: 'observation:e1',
  revision: 'v1',
};
beforeEach(() => {
  vi.clearAllMocks();
  const response = ok([{ subject, reviews: [], latest: null, resolved: false, issue: 'Awaiting official review' }]);
  api.list.mockResolvedValue(response);
  api.listEvent.mockResolvedValue(response);
  api.record.mockResolvedValue(response);
});
it('requires a named official and statement, and sends the exact reviewed evidence revision', async () => {
  render(<ObservationReviewsPanel competitionId="competition" />);
  await screen.findByRole('option', { name: /Pending/ });
  fireEvent.change(screen.getByLabelText('Observation to review'), { target: { value: subject.id } });
  expect(screen.getByRole('button', { name: 'Record official review' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Review official'), { target: { value: 'Jury A' } });
  fireEvent.change(screen.getByLabelText('Review statement'), { target: { value: 'Independent printout checked' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record official review' }));
  await waitFor(() =>
    expect(api.record).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionId: 'competition',
        subjectId: subject.id,
        subjectRevision: 'v1',
        previousReviewId: null,
        action: 'NO_SCORE_CHANGE',
        statement: 'Independent printout checked',
      }),
    ),
  );
});
it('loads archived competition evidence from the selected result scope', async () => {
  render(<ObservationReviewsPanel eventId="event" resultScope="FINAL" />);
  await waitFor(() => expect(api.listEvent).toHaveBeenCalledWith({ eventId: 'event', resultScope: 'FINAL' }));
  expect(api.list).not.toHaveBeenCalled();
});
it('shows a failed load as error text and a failed review record as its message', async () => {
  api.list.mockResolvedValueOnce(fail('Review evidence is unavailable'));
  render(<ObservationReviewsPanel competitionId="competition" />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/^Error: Review evidence is unavailable$/);

  fireEvent.click(screen.getByRole('button', { name: 'Refresh review' }));
  await screen.findByRole('option', { name: /Pending/ });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  api.record.mockResolvedValueOnce(fail('The evidence revision changed', 'CONFLICT'));
  fireEvent.change(screen.getByLabelText('Observation to review'), { target: { value: subject.id } });
  fireEvent.change(screen.getByLabelText('Review official'), { target: { value: 'Jury A' } });
  fireEvent.change(screen.getByLabelText('Review statement'), { target: { value: 'Independent printout checked' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record official review' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/^The evidence revision changed$/);
  expect(screen.getByLabelText('Review statement')).toHaveValue('Independent printout checked');
  expect(api.list).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Refresh review' })).toBeEnabled();
});

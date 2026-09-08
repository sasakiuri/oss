import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResultPublicationPanel } from '@/renderer/presentation/features/championship/components/ResultPublicationPanel';

const { getStatus, publishPreliminary } = vi.hoisted(() => ({ getStatus: vi.fn(), publishPreliminary: vi.fn() }));
vi.mock('@/renderer/services', () => ({ resultPublicationService: { getStatus, publishPreliminary } }));
vi.mock('@/renderer/presentation/features/observation-reviews/ObservationReviewsPanel', () => ({
  ObservationReviewsPanel: () => null,
}));
const status = {
  status: 'DRAFT',
  currentSnapshotRevision: 'a'.repeat(64),
  preliminaryId: null,
  postedAt: null,
  protestEndsAt: null,
  publicationCurrent: false,
  canPublishOfficial: false,
  canRegisterProtest: false,
  history: [],
  issues: [],
  openProtestReferences: [],
};
describe('Preliminary posting confirmation', () => {
  it('binds an earlier posting to the displayed revision and keeps failed confirmation visible', async () => {
    getStatus.mockResolvedValue({ success: true, data: status });
    publishPreliminary.mockResolvedValue({ success: false, error: { message: 'Result revision changed' } });
    render(<ResultPublicationPanel eventId="event" onClose={() => undefined} />);
    const button = await screen.findByRole('button', { name: 'Record preliminary posting' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Result publication official'), { target: { value: 'RTS Officer' } });
    fireEvent.change(screen.getByLabelText('Posting destination'), { target: { value: 'Main board' } });
    fireEvent.change(screen.getByLabelText('Posting time'), { target: { value: 'EARLIER' } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Actual posting time (local)'), {
      target: { value: '2026-09-09T10:05:00' },
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(publishPreliminary).toHaveBeenCalledWith({
        eventId: 'event',
        resultScope: 'QUALIFICATION',
        officialName: 'RTS Officer',
        posting: {
          snapshotRevision: status.currentSnapshotRevision,
          location: 'Main board',
          postedAt: new Date('2026-09-09T10:05:00').toISOString(),
        },
      }),
    );
    expect(await screen.findByText('Result revision changed')).toBeVisible();
  });
});

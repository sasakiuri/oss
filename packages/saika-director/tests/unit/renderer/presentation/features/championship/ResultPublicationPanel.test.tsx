import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResultPublicationPanel } from '@/renderer/presentation/features/championship/components/ResultPublicationPanel';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

const { getStatus, publishPreliminary, registerProtest, resolveProtest, publishOfficial } = vi.hoisted(() => ({
  getStatus: vi.fn(),
  publishPreliminary: vi.fn(),
  registerProtest: vi.fn(),
  resolveProtest: vi.fn(),
  publishOfficial: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  resultPublicationService: { getStatus, publishPreliminary, registerProtest, resolveProtest, publishOfficial },
}));
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

describe('Result publication errors', () => {
  it('shows a failed status load as its message or the fallback text', async () => {
    getStatus.mockResolvedValueOnce(fail('Event not found'));
    const { unmount } = render(<ResultPublicationPanel eventId="event" onClose={() => undefined} />);
    expect(await screen.findByText('Event not found')).toBeVisible();
    unmount();

    getStatus.mockRejectedValueOnce('offline');
    render(<ResultPublicationPanel eventId="event" onClose={() => undefined} />);
    expect(await screen.findByText('Failed to load result publication status')).toBeVisible();
  });

  it('shows failed publication commands as their messages or the fallback text', async () => {
    getStatus.mockResolvedValue(
      ok({
        ...status,
        status: 'PROTEST_PENDING',
        preliminaryId: 'preliminary',
        publicationCurrent: true,
        canRegisterProtest: true,
        canPublishOfficial: true,
        openProtestReferences: ['P-1'],
      }),
    );
    registerProtest.mockResolvedValueOnce(fail('The protest is already registered'));
    resolveProtest.mockResolvedValueOnce({ success: false });
    publishOfficial.mockResolvedValueOnce(fail('Results are not approved')).mockRejectedValueOnce('offline');
    render(<ResultPublicationPanel eventId="event" onClose={() => undefined} />);
    fireEvent.change(await screen.findByLabelText('Result publication official'), {
      target: { value: 'RTS Officer' },
    });

    fireEvent.change(screen.getByLabelText('Score protest reference'), { target: { value: 'P-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByText('The protest is already registered')).toBeVisible();
    expect(screen.getByLabelText('Score protest reference')).toHaveValue('P-2');

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    fireEvent.change(screen.getByLabelText('Resolution for P-1'), { target: { value: 'Rejected' } });
    fireEvent.click(screen.getByRole('button', { name: 'Append resolution' }));
    expect(await screen.findByText('Publication command failed')).toBeVisible();
    expect(screen.getByLabelText('Resolution for P-1')).toHaveValue('Rejected');

    fireEvent.click(screen.getByRole('button', { name: 'Publish official results' }));
    expect(await screen.findByText('Results are not approved')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Publish official results' }));
    await waitFor(() => expect(screen.queryByText('Results are not approved')).toBeNull());
    expect(await screen.findByText('Publication command failed')).toBeVisible();
  });
});

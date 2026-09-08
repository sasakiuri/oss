import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicationReviewPolicyPanel } from '@/renderer/presentation/features/championship/components/PublicationReviewPolicyPanel';
import type { PublicationReviewPolicyStatus } from '@/shared/ipc/contracts/publicationReviewPolicy.contract';

const { get, save } = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock('@/renderer/services', () => ({ publicationReviewPolicyService: { get, save } }));
const defaults = {
  requireObservationReviews: true,
  requireIncidentReports: true,
  requireFinalRecoveriesComplete: true,
  requireProtestCasesComplete: true,
  requireEquipmentChecksComplete: true,
};
const status: PublicationReviewPolicyStatus = {
  eventId: 'event',
  resultScope: 'FINAL',
  mode: 'INHERIT',
  defaults,
  effectiveSettings: defaults,
  revision: 'a'.repeat(64),
  editable: true,
  history: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  get.mockResolvedValue({ success: true, data: status });
});
describe('Event review settings', () => {
  it('pins independently selected reviews and refreshes the approval after saving', async () => {
    const onChanged = vi.fn(async () => undefined);
    save.mockResolvedValue({
      success: true,
      data: { ...status, mode: 'PINNED', effectiveSettings: { ...defaults, requireIncidentReports: false } },
    });
    render(<PublicationReviewPolicyPanel eventId="event" resultScope="FINAL" onChanged={onChanged} />);
    const incidents = await screen.findByLabelText('Complete incident reports');
    expect(incidents).toBeChecked();
    expect(incidents).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Settings source'), { target: { value: 'PINNED' } });
    fireEvent.click(incidents);
    expect(screen.getByLabelText('Complete protest cases')).toBeChecked();
    fireEvent.change(screen.getByLabelText('Responsible official'), { target: { value: 'RTS official' } });
    fireEvent.change(screen.getByLabelText('Reason for these event settings'), {
      target: { value: 'Separate incident process' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save event settings' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        eventId: 'event',
        resultScope: 'FINAL',
        mode: 'PINNED',
        settings: { ...defaults, requireIncidentReports: false },
        expectedRevision: status.revision,
        officialName: 'RTS official',
        reason: 'Separate incident process',
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  });

  it('retains failed edits and offers reload when another operator changed the policy', async () => {
    const onChanged = vi.fn(async () => undefined);
    save.mockResolvedValue({ success: false, error: { message: 'The event policy changed; reload before saving' } });
    render(<PublicationReviewPolicyPanel eventId="event" resultScope="FINAL" onChanged={onChanged} />);
    fireEvent.change(await screen.findByLabelText('Responsible official'), { target: { value: 'RTS' } });
    fireEvent.change(screen.getByLabelText('Reason for these event settings'), {
      target: { value: 'Use shared process' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save event settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed');
    expect(screen.getByLabelText('Reason for these event settings')).toHaveValue('Use shared process');
    expect(onChanged).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload event settings' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('shows the historical reason and signer while preventing edits to an official event', async () => {
    get.mockResolvedValue({
      success: true,
      data: {
        ...status,
        editable: false,
        history: [
          {
            id: 'entry',
            eventId: 'event',
            resultScope: 'FINAL',
            mode: 'PINNED',
            settings: defaults,
            recordedAt: '2026-09-09T00:00:00.000Z',
            reason: 'Championship review procedure',
            signingEvidence: {
              method: 'AUTHENTICATED',
              actorId: 'actor',
              recordedBy: 'RTS lead',
              evidenceReference: null,
            },
          },
        ],
      },
    });
    render(<PublicationReviewPolicyPanel eventId="event" resultScope="FINAL" onChanged={async () => undefined} />);
    expect(await screen.findByLabelText('Settings source')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save event settings' })).toBeDisabled();
    fireEvent.click(screen.getByText('Event setting history (1)'));
    expect(screen.getByText('Championship review procedure')).toBeVisible();
    expect(screen.getByText(/RTS lead/)).toBeVisible();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProtestsPanel } from '@/renderer/presentation/features/protests/ProtestsPanel';

import { PROTEST_ID, protestFixture } from '../../../../../helpers/protestFixture';

const { list, create, recordEntry, openProtestPrint } = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  recordEntry: vi.fn(),
  openProtestPrint: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  protestsService: { list, create, recordEntry },
  boardService: { openProtestPrint },
}));

function fill(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
async function openWrittenForm() {
  render(<ProtestsPanel scopeId="event-a" />);
  await waitFor(() => expect(list).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Lodge' }));
  fill('Type', 'WRITTEN');
  fill('Lodged by', 'Team official');
  fill('Receiving official', 'Range official');
  fill('Subject', 'Interruption decision');
  fill('Statement', 'Review requested');
}

describe('ProtestsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ success: true, data: [] });
    create.mockResolvedValue({ success: true, data: protestFixture() });
  });

  it('records the actual fee and original receipt time for a late paper filing', async () => {
    await openWrittenForm();
    fill(/Received at/, '2026-09-08T09:45:12');
    fill(/Decision \/ action time/, '2026-09-08T09:00:03');
    fill(/Fee received/, '20');
    fill('Form P reference', 'P-42');
    fill(/Late acceptance explanation/, 'Paper record entered after the relay');
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          feePaidEuro: 20,
          lodgedAt: new Date('2026-09-08T09:45:12').toISOString(),
          triggeringDecisionAt: new Date('2026-09-08T09:00:03').toISOString(),
          lateAcceptanceReason: 'Paper record entered after the relay',
          formReference: 'P-42',
        }),
      ),
    );
  });

  it('preserves unknown fees and missing form references instead of asserting payment', async () => {
    await openWrittenForm();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          feePaidEuro: null,
          formReference: null,
          triggeringDecisionAt: null,
        }),
      ),
    );
  });

  it('keeps the entered statement after a failed save and prevents repeated submissions while waiting', async () => {
    let complete!: (value: unknown) => void;
    create.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await openWrittenForm();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(create).toHaveBeenCalledTimes(1);
    complete({ success: false, error: { message: 'Receipt could not be saved' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Receipt could not be saved');
    expect(screen.getByLabelText('Statement')).toHaveValue('Review requested');
    expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
  });

  it('opens the selected record for printing and retains a failed historical decision for retry', async () => {
    list.mockResolvedValue({ success: true, data: [protestFixture()] });
    recordEntry.mockRejectedValue(new Error('Connection lost'));
    openProtestPrint.mockResolvedValue({ success: true, data: 'window-1' });
    render(<ProtestsPanel scopeId="event-a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Print operational copy' }));
    await waitFor(() => expect(openProtestPrint).toHaveBeenCalledWith({ protestId: PROTEST_ID }));
    fill('Official', 'Jury chair');
    fill('Decision / note', 'Decision communicated on paper');
    fill('Rule reference', '6.16.6');
    fill(/Action time/, '2026-09-08T09:30:21');
    fireEvent.click(screen.getByRole('button', { name: 'Append action' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(recordEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: PROTEST_ID,
        ruleReference: '6.16.6',
        occurredAt: new Date('2026-09-08T09:30:21').toISOString(),
      }),
    );
    expect(screen.getByLabelText('Decision / note')).toHaveValue('Decision communicated on paper');
  });
});

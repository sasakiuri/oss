import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResultsView } from '@/renderer/presentation/features/championship/components/ResultsView';
import type { RankedResultDto } from '@/shared/ipc/contracts/results.contract';

const { getByEvent, getByRelay, getFinalByEvent, confirm, openResultsListPrint } = vi.hoisted(() => ({
  getByEvent: vi.fn(),
  getByRelay: vi.fn(),
  getFinalByEvent: vi.fn(),
  confirm: vi.fn(),
  openResultsListPrint: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  resultsService: { getByEvent, getByRelay, getFinalByEvent, confirm },
  boardService: { openResultsListPrint },
}));

function createResult(id: string, relayNumber: number, playerName: string): RankedResultDto {
  return {
    id,
    rank: relayNumber,
    playerName,
    affiliation: 'Test Team',
    relayNumber,
    seriesScores: [100],
    totalScore: 100,
    confirmedAt: '2026-01-01T00:00:00.000Z',
    status: 'published',
  };
}

const eventOneResults = [
  createResult('result-1', 1, 'Relay One Athlete'),
  createResult('result-2', 2, 'Relay Two Athlete'),
];

describe('ResultsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getByEvent.mockImplementation(({ eventId }: { eventId: string }) =>
      Promise.resolve({
        success: true,
        data: {
          eventId,
          results: eventId === 'event-1' ? eventOneResults : [createResult('result-3', 1, 'New Event Athlete')],
        },
      }),
    );
    getByRelay.mockImplementation(({ eventId, relayNumber }: { eventId: string; relayNumber: number }) =>
      Promise.resolve({
        success: true,
        data: {
          eventId,
          relayNumber,
          results: eventId === 'event-1' ? eventOneResults.filter((result) => result.relayNumber === relayNumber) : [],
        },
      }),
    );
  });

  it('keeps every relay available after filtering to one relay', async () => {
    render(<ResultsView eventId="event-1" />);

    await screen.findByText('Relay Two Athlete');
    fireEvent.change(screen.getByLabelText('Relay:'), { target: { value: '1' } });

    await waitFor(() => expect(getByRelay).toHaveBeenCalledWith({ eventId: 'event-1', relayNumber: 1 }));
    expect(await screen.findByRole('option', { name: 'Relay 2' })).toBeInTheDocument();
  });

  it('resets the relay filter when switching events', async () => {
    const { rerender } = render(<ResultsView eventId="event-1" />);

    await screen.findByText('Relay Two Athlete');
    fireEvent.change(screen.getByLabelText('Relay:'), { target: { value: '2' } });
    await waitFor(() => expect(getByRelay).toHaveBeenCalledWith({ eventId: 'event-1', relayNumber: 2 }));

    rerender(<ResultsView eventId="event-2" />);

    expect(await screen.findByText('New Event Athlete')).toBeInTheDocument();
    expect(screen.getByLabelText('Relay:')).toHaveValue('all');
    expect(getByEvent).toHaveBeenCalledWith({ eventId: 'event-2' });
  });

  it('does not reload an old event when its confirmation finishes after switching events', async () => {
    let resolveConfirm!: (value: { success: true }) => void;
    const confirmation = new Promise<{ success: true }>((resolve) => {
      resolveConfirm = resolve;
    });
    confirm.mockReturnValue(confirmation);
    const { rerender } = render(<ResultsView eventId="event-1" />);

    await screen.findByText('Relay Two Athlete');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm (2)' }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith({ eventId: 'event-1', resultIds: ['result-1', 'result-2'] }),
    );

    rerender(<ResultsView eventId="event-2" />);
    expect(await screen.findByText('New Event Athlete')).toBeInTheDocument();

    await act(async () => {
      resolveConfirm({ success: true });
      await confirmation;
    });

    expect(screen.getByText('New Event Athlete')).toBeInTheDocument();
    expect(screen.queryByText('Relay One Athlete')).not.toBeInTheDocument();
    expect(getByEvent.mock.calls.map(([input]) => input)).toEqual([{ eventId: 'event-1' }, { eventId: 'event-2' }]);
  });
});

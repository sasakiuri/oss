import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PublishedResultsSummary } from '@/renderer/presentation/features/boards/PublishedResultsSummary';
import type { ResultBoardSnapshotDto } from '@/shared/ipc/contracts/resultPublication.contract';

const { getBoardSnapshot } = vi.hoisted(() => ({ getBoardSnapshot: vi.fn() }));
vi.mock('@/renderer/services', () => ({ resultPublicationService: { getBoardSnapshot } }));

function response(patch: Partial<ResultBoardSnapshotDto> = {}) {
  return {
    success: true as const,
    data: {
      eventId: 'event',
      resultScope: 'QUALIFICATION' as const,
      snapshotRevision: 'a'.repeat(64),
      checkedAt: '2026-09-09T03:00:00.000Z',
      state: 'OFFICIAL' as const,
      postedAt: '2026-09-09T01:00:00.000Z',
      protestEndsAt: '2026-09-09T01:10:00.000Z',
      results: [
        {
          resultId: 'result',
          rank: 1,
          playerName: 'Athlete',
          affiliation: 'Team',
          totalScore: 625.4,
          classificationCode: null,
        },
      ],
      ...patch,
    },
  };
}
async function flush() {
  await act(async () => {});
}
beforeEach(() => {
  vi.useFakeTimers();
  getBoardSnapshot.mockReset();
  getBoardSnapshot.mockResolvedValue(response());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PublishedResultsSummary', () => {
  it('updates publication state together with scores and removes obsolete deadlines', async () => {
    render(<PublishedResultsSummary eventId="event" resultScope="QUALIFICATION" />);
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('Official');
    expect(screen.getByText('625.4')).toBeInTheDocument();
    expect(screen.getByText(/Protest deadline:/)).toBeInTheDocument();
    getBoardSnapshot.mockResolvedValue(
      response({
        state: 'REVIEW_REQUIRED',
        protestEndsAt: null,
        postedAt: null,
        results: [{ ...response().data.results[0]!, totalScore: 623.4 }],
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Publication review required');
    expect(screen.getByText('623.4')).toBeInTheDocument();
    expect(screen.queryByText('625.4')).not.toBeInTheDocument();
    expect(screen.queryByText(/Protest deadline:/)).not.toBeInTheDocument();
  });

  it('withdraws the official label on failure while retaining the last rows, then recovers', async () => {
    render(<PublishedResultsSummary eventId="event" resultScope="QUALIFICATION" />);
    await flush();
    getBoardSnapshot.mockRejectedValue(new Error('Offline'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Publication status unconfirmed');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('625.4')).toBeInTheDocument();
    expect(screen.queryByText(/Protest deadline:/)).not.toBeInTheDocument();
    getBoardSnapshot.mockResolvedValue(response());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Official');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('times out a stalled update and ignores its later response', async () => {
    render(<PublishedResultsSummary eventId="event" resultScope="QUALIFICATION" />);
    await flush();
    let resolve!: (result: ReturnType<typeof response>) => void;
    getBoardSnapshot.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('timed out');
    await act(async () => {
      resolve(response());
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('discards an in-flight response after switching events', async () => {
    let resolve!: (result: ReturnType<typeof response>) => void;
    getBoardSnapshot.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(<PublishedResultsSummary eventId="event" resultScope="QUALIFICATION" />);
    getBoardSnapshot.mockResolvedValue(
      response({
        eventId: 'next',
        resultScope: 'FINAL',
        state: 'FINAL',
        protestEndsAt: null,
        results: [{ ...response().data.results[0]!, playerName: 'Next athlete' }],
      }),
    );
    view.rerender(<PublishedResultsSummary eventId="next" resultScope="FINAL" />);
    await flush();
    await act(async () => {
      resolve(response());
    });
    expect(screen.getByRole('status')).toHaveTextContent('RESULTS ARE FINAL');
    expect(screen.getByText('Next athlete')).toBeInTheDocument();
    expect(screen.queryByText('Athlete')).not.toBeInTheDocument();
    expect(screen.queryByText(/Protest deadline:/)).not.toBeInTheDocument();
  });
});

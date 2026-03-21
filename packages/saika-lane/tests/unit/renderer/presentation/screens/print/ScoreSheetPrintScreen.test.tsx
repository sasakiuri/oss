// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScoreSheetPrintScreen } from '@/renderer/presentation/screens/print/ScoreSheetPrintScreen';

// ---------- reportService mock ----------

const mockGetScoreSheet = vi.fn();

vi.mock('@/renderer/services/reportService', () => ({
  reportService: {
    getScoreSheet: (...args: unknown[]) => mockGetScoreSheet(...args),
  },
}));

// ---------- helpers ----------

function setSearchParams(params: Record<string, string>) {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: {
      ...window.location,
      search: new URLSearchParams(params).toString() ? `?${new URLSearchParams(params).toString()}` : '',
    },
  });
}

const validScoreSheet = {
  sessionId: 'session-001',
  laneNumber: 1,
  relay: 0,
  playerName: 'Test Player',
  affiliation: '',
  allShots: [{ shotNumber: 1, value: 10.2, integerValue: 10, seriesNumber: 1 }],
  seriesScores: [10.2],
  totalScore: 10.2,
  totalIntegerScore: 10,
  disciplineName: '10m Air Rifle',
};

// ---------- tests ----------

describe('ScoreSheetPrintScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScoreSheet.mockReset();
  });

  it('displays error message when sessionId is not specified', async () => {
    setSearchParams({});
    render(<ScoreSheetPrintScreen />);

    await waitFor(() => {
      expect(screen.getByText('Session ID is not specified')).toBeInTheDocument();
    });
  });

  it('displays "Loading..." while loading', () => {
    setSearchParams({ sessionId: 'session-001' });
    mockGetScoreSheet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ScoreSheetPrintScreen />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays the score sheet on successful data retrieval', async () => {
    setSearchParams({ sessionId: 'session-001' });
    mockGetScoreSheet.mockResolvedValue(validScoreSheet);

    render(<ScoreSheetPrintScreen />);

    await waitFor(() => {
      expect(screen.getByText('10m Air Rifle')).toBeInTheDocument();
    });
  });

  it('displays an error message on data retrieval failure', async () => {
    setSearchParams({ sessionId: 'session-001' });
    mockGetScoreSheet.mockRejectedValue(new Error('Retrieval failed'));

    render(<ScoreSheetPrintScreen />);

    await waitFor(() => {
      expect(screen.getByText('Retrieval failed')).toBeInTheDocument();
    });
  });

  it('displays the default error message when rejected with a non-Error object', async () => {
    setSearchParams({ sessionId: 'session-001' });
    mockGetScoreSheet.mockRejectedValue('unknown error');

    render(<ScoreSheetPrintScreen />);

    await waitFor(() => {
      expect(screen.getByText('Failed to retrieve score sheet')).toBeInTheDocument();
    });
  });

  it('print button calls window.print()', async () => {
    setSearchParams({ sessionId: 'session-001' });
    mockGetScoreSheet.mockResolvedValue(validScoreSheet);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(<ScoreSheetPrintScreen />);

    await waitFor(() => {
      expect(screen.getByText('Print')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Print'));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('close button calls window.close()', async () => {
    setSearchParams({ sessionId: 'session-001' });
    mockGetScoreSheet.mockResolvedValue(validScoreSheet);
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    render(<ScoreSheetPrintScreen />);

    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Close'));
    expect(closeSpy).toHaveBeenCalled();
    closeSpy.mockRestore();
  });
});

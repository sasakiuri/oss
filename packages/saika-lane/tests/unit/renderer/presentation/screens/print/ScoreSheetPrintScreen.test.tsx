// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGetScoreSheetHandler } from '@/main/modules/report/application/handlers/GetScoreSheetHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { ScoreSheetPrintScreen } from '@/renderer/presentation/screens/print/ScoreSheetPrintScreen';

import { createMockSessionRepository, createMockStorage } from '../../../../../helpers/mockDependencies';

// ---------- reportService mock ----------

const mockGetScoreSheet = vi.fn();
const mockPrintReady = vi.fn().mockResolvedValue(undefined);

vi.mock('@/renderer/services/reportService', () => ({
  reportService: {
    getScoreSheet: (...args: unknown[]) => mockGetScoreSheet(...args),
    printReady: (...args: unknown[]) => mockPrintReady(...args),
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

  it('waits for data and fonts before reporting readiness for direct printing', async () => {
    setSearchParams({ sessionId: 'session-001', autoPrint: 'true', pageSize: 'Letter', landscape: 'true' });
    let loaded!: () => void;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        ready: new Promise<void>((resolve) => {
          loaded = resolve;
        }),
      },
    });
    mockGetScoreSheet.mockResolvedValue(validScoreSheet);
    render(<ScoreSheetPrintScreen />);
    await screen.findByText('10m Air Rifle');
    expect(mockPrintReady).not.toHaveBeenCalled();
    loaded();
    await waitFor(() => expect(mockPrintReady).toHaveBeenCalledWith({}));
    expect(document.querySelector('style')?.textContent).toContain('Letter landscape');
  });

  it('reports data retrieval errors to the direct print owner', async () => {
    setSearchParams({ sessionId: 'session-001', autoPrint: 'true' });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
    mockGetScoreSheet.mockRejectedValue(new Error('Read failed'));
    render(<ScoreSheetPrintScreen />);
    await waitFor(() => expect(mockPrintReady).toHaveBeenCalledWith({ error: 'Read failed' }));
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

  it('displays every sighting shot in its ten-shot series from the score sheet query', async () => {
    let session = Session.create(Discipline.beamPistol10m(), 'RING');
    const scores = [100, 90, 80, 70, 60, 50].flatMap((score) => Array<number>(10).fill(score));
    scores.push(40);
    for (const score of scores) {
      session = session.recordShot(new ImpactPoint(0.1, 0.2), new Score(score), new Date());
    }
    const sessionRepo = createMockSessionRepository();
    vi.mocked(sessionRepo.findById).mockResolvedValue(session);
    const getScoreSheet = createGetScoreSheetHandler(sessionRepo, createMockStorage());
    const data = await getScoreSheet({ sessionId: session.id });
    expect(data.allShots).toHaveLength(61);
    expect(data.seriesScores).toEqual([1000, 900, 800, 700, 600, 500, 40]);
    mockGetScoreSheet.mockResolvedValue(data);
    setSearchParams({ sessionId: session.id });

    const { container } = render(<ScoreSheetPrintScreen />);
    await screen.findByText('10m Beam Pistol');

    const seriesBlocks = container.querySelectorAll('.series-block');
    expect(seriesBlocks).toHaveLength(7);
    const shotValues = (seriesIndex: number) =>
      Array.from(seriesBlocks[seriesIndex]!.querySelectorAll('.shot-value'), (cell) => cell.textContent);
    expect(shotValues(0)).toEqual(Array<string>(10).fill('10.0'));
    expect(shotValues(1)).toEqual(Array<string>(10).fill('9.0'));
    expect(shotValues(2)).toEqual(Array<string>(10).fill('8.0'));
    expect(shotValues(3)).toEqual(Array<string>(10).fill('7.0'));
    expect(shotValues(4)).toEqual(Array<string>(10).fill('6.0'));
    expect(shotValues(5)).toEqual(Array<string>(10).fill('5.0'));
    expect(shotValues(6)).toEqual(['4.0', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
    expect(seriesBlocks[0]!.querySelector('.series-header')).toHaveTextContent('Series 1: 100(100.0)');
    expect(seriesBlocks[1]!.querySelector('.series-header')).toHaveTextContent('Series 2: 90(90.0)');
    expect(seriesBlocks[6]!.querySelector('.series-header')).toHaveTextContent('Series 7: 4(4.0)');
    expect(seriesBlocks[6]).toHaveClass('series-page-break');
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

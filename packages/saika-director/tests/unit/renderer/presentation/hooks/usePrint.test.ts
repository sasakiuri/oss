import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockGetScoreSheets } = vi.hoisted(() => ({
  mockGetScoreSheets: vi.fn(),
}));

// --- Mock: Logger ---
vi.mock('@/shared/utils/Logger', () => ({
  Logger: {
    create: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      logError: vi.fn(),
      userAction: vi.fn(),
      startTimer: vi.fn(),
    }),
  },
}));

// --- Mock: Service ---
vi.mock('@/renderer/services', () => ({
  laneControlService: {
    getScoreSheets: mockGetScoreSheets,
  },
}));

import { usePrint } from '@/renderer/presentation/hooks/usePrint';

describe('usePrint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with isPrintMode false, empty printData, and loading false', () => {
    const { result } = renderHook(() => usePrint());

    expect(result.current.isPrintMode).toBe(false);
    expect(result.current.printData).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('openPrintView sets printData and enables print mode on success', async () => {
    const scoreSheets = [
      { laneId: 'lane-1', playerName: 'Alex Smith', shots: [] },
      { laneId: 'lane-2', playerName: 'Jordan Lee', shots: [] },
    ];
    mockGetScoreSheets.mockResolvedValue({
      success: true,
      data: { scoreSheets },
    });

    const { result } = renderHook(() => usePrint());

    await act(async () => {
      await result.current.openPrintView(['lane-1', 'lane-2']);
    });

    expect(mockGetScoreSheets).toHaveBeenCalledWith({ laneIds: ['lane-1', 'lane-2'] });
    expect(result.current.isPrintMode).toBe(true);
    expect(result.current.printData).toHaveLength(2);
    expect(result.current.loading).toBe(false);
  });

  it('openPrintView adds context information to score sheets', async () => {
    const scoreSheets = [{ laneId: 'lane-1', playerName: 'Alex Smith', shots: [] }];
    mockGetScoreSheets.mockResolvedValue({
      success: true,
      data: { scoreSheets },
    });

    const context = {
      championshipName: 'National Championship',
      venue: 'Tokyo',
      eventName: 'BR60S',
    };

    const { result } = renderHook(() => usePrint());

    await act(async () => {
      await result.current.openPrintView(['lane-1'], context);
    });

    expect(result.current.printData[0]).toEqual(
      expect.objectContaining({
        laneId: 'lane-1',
        playerName: 'Alex Smith',
        championshipName: 'National Championship',
        venue: 'Tokyo',
        eventName: 'BR60S',
      }),
    );
  });

  it('openPrintView keeps print mode disabled on failure', async () => {
    mockGetScoreSheets.mockResolvedValue({
      success: false,
      data: null,
      error: 'not found',
    });

    const { result } = renderHook(() => usePrint());

    await act(async () => {
      await result.current.openPrintView(['lane-1']);
    });

    expect(result.current.isPrintMode).toBe(false);
    expect(result.current.printData).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('closePrintView disables print mode and clears printData', async () => {
    mockGetScoreSheets.mockResolvedValue({
      success: true,
      data: { scoreSheets: [{ laneId: 'lane-1', playerName: 'Alex Smith', shots: [] }] },
    });

    const { result } = renderHook(() => usePrint());

    await act(async () => {
      await result.current.openPrintView(['lane-1']);
    });

    expect(result.current.isPrintMode).toBe(true);

    act(() => {
      result.current.closePrintView();
    });

    expect(result.current.isPrintMode).toBe(false);
    expect(result.current.printData).toEqual([]);
  });
});

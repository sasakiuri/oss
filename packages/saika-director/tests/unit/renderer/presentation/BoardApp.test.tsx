// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BoardApp from '@/renderer/presentation/BoardApp';

const { getConfig } = vi.hoisted(() => ({ getConfig: vi.fn() }));

vi.mock('@/renderer/services', () => ({
  boardService: { getConfig },
}));
vi.mock('@/renderer/presentation/features/boards/TargetBoardScreen', () => ({
  TargetBoardScreen: ({ config }: { config: { laneRange?: { from: number; to: number } } }) => (
    <div>target board {config.laneRange?.from}</div>
  ),
}));
vi.mock('@/renderer/presentation/features/boards/RankingBoardScreen', async () => {
  const { useEventBus } = await import('@/renderer/events/EventBusProvider');
  return {
    RankingBoardScreen: () => {
      useEventBus();
      return <div>ranking board</div>;
    },
  };
});
vi.mock('@/renderer/presentation/features/boards/ResultsBoardScreen', () => ({
  ResultsBoardScreen: () => <div>results board</div>,
}));
vi.mock('@/renderer/presentation/features/boards/FinalBoardScreen', () => ({
  FinalBoardScreen: () => <div>final board</div>,
}));
vi.mock('@/renderer/presentation/features/print/ScoreSheetPrintScreen', () => ({
  ScoreSheetPrintScreen: () => <div>score sheet</div>,
}));
vi.mock('@/renderer/presentation/features/print/ResultsListPrintScreen', () => ({
  ResultsListPrintScreen: () => <div>results list</div>,
}));

describe('BoardApp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unwraps the query response before selecting the board screen', async () => {
    getConfig.mockResolvedValue({
      success: true,
      data: { type: 'target-board', laneRange: { from: 1, to: 3 } },
    });

    render(<BoardApp />);

    expect(await screen.findByText('target board 1')).toBeInTheDocument();
    expect(screen.queryByText(/Unknown board type/)).not.toBeInTheDocument();
  });

  it('shows the IPC error when the configuration query fails', async () => {
    getConfig.mockResolvedValue({
      success: false,
      data: null,
      error: { code: 'BOARD_CONFIG_FAILED', message: 'configuration unavailable' },
    });

    render(<BoardApp />);

    expect(await screen.findByText('configuration unavailable')).toBeInTheDocument();
  });

  it('provides the event bus required by live board screens', async () => {
    getConfig.mockResolvedValue({
      success: true,
      data: { type: 'ranking-board' },
    });

    render(<BoardApp />);

    expect(await screen.findByText('ranking board')).toBeInTheDocument();
  });
});

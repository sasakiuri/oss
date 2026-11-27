// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BoardApp from '@/renderer/presentation/BoardApp';
import { fail, ok } from '../../../helpers/renderer/serviceResponses';

const { getConfig } = vi.hoisted(() => ({ getConfig: vi.fn() }));
const REPORT_ID = '11111111-1111-4111-8111-111111111111';

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
vi.mock('@/renderer/presentation/features/print/IncidentReportPrintScreen', () => ({
  IncidentReportPrintScreen: ({ config }: { config: { reportId?: string } }) => (
    <div>incident report {config.reportId}</div>
  ),
}));
vi.mock('@/renderer/presentation/features/print/ProtestPrintScreen', () => ({
  ProtestPrintScreen: ({ config }: { config: { protestId?: string } }) => <div>protest {config.protestId}</div>,
}));

describe('BoardApp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unwraps the query response before selecting the board screen', async () => {
    getConfig.mockResolvedValue(ok({ type: 'target-board', laneRange: { from: 1, to: 3 } }));

    render(<BoardApp />);

    expect(await screen.findByText('target board 1')).toBeInTheDocument();
    expect(screen.queryByText(/Unknown board type/)).not.toBeInTheDocument();
  });

  it('shows the IPC error when the configuration query fails', async () => {
    getConfig.mockResolvedValue(fail('configuration unavailable', 'BOARD_CONFIG_FAILED'));

    render(<BoardApp />);

    expect(await screen.findByText('configuration unavailable')).toBeInTheDocument();
  });

  it('shows the fallback text when loading the configuration fails without an error', async () => {
    getConfig.mockRejectedValue('offline');

    render(<BoardApp />);

    expect(await screen.findByText('Failed to load configuration')).toBeInTheDocument();
  });

  it('provides the event bus required by live board screens', async () => {
    getConfig.mockResolvedValue(ok({ type: 'ranking-board' }));

    render(<BoardApp />);

    expect(await screen.findByText('ranking board')).toBeInTheDocument();
  });

  it('routes an incident report print configuration to its print screen', async () => {
    getConfig.mockResolvedValue(ok({ type: 'incident-report-print', reportId: REPORT_ID }));

    render(<BoardApp />);

    expect(await screen.findByText(`incident report ${REPORT_ID}`)).toBeInTheDocument();
  });

  it('routes a protest print configuration without losing the case ID', async () => {
    getConfig.mockResolvedValue(ok({ type: 'protest-print', protestId: REPORT_ID }));
    render(<BoardApp />);
    expect(await screen.findByText(`protest ${REPORT_ID}`)).toBeInTheDocument();
  });
});

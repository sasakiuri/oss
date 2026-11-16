import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScoreSheetPrintScreen } from '@/renderer/presentation/features/print/ScoreSheetPrintScreen';
import { laneControlService } from '@/renderer/services';
import type { BoardWindowConfig } from '@/shared/types/BoardWindowConfig';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const { getAll, getScoreSheets } = vi.mocked(laneControlService);

type LaneState = Extract<Awaited<ReturnType<typeof laneControlService.getAll>>, { success: true }>['data'][number];

function lane(overrides: Partial<LaneState>): LaneState {
  return {
    id: 'lane-1',
    channel: 1,
    player: null,
    phase: 'FINISHED',
    unifiedPhase: 'FINISHED',
    stageIndex: 2,
    seriesIndex: 0,
    roundType: 'Final',
    stageName: 'Finished',
    timer: null,
    preparationShots: [],
    matchShots: [],
    shootoffShots: [],
    eliminated: false,
    eliminationRank: null,
    totalScore: 0,
    stage1Total: 0,
    stage2Total: 0,
    seriesScores: [],
    recentShots: [],
    shotNumber: 0,
    lastScore: null,
    lastShotTime: null,
    remainingTime: 0,
    relayNumber: 1,
    ...overrides,
  };
}

const config = (laneIds: string[]): BoardWindowConfig => ({
  type: 'score-sheet-print',
  laneIds,
  championshipName: 'Spring Cup',
  venue: 'Range A',
  eventName: 'AR60 Final',
});

function rows(container: HTMLElement): string[] {
  return [...container.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent).join('|'),
  );
}

describe('ScoreSheetPrintScreen', () => {
  beforeEach(() => vi.resetAllMocks());

  it('prints Final results from the live Lane state with the print fallbacks', async () => {
    getScoreSheets.mockResolvedValue(ok({ success: true, scoreSheets: [] }));
    const shots = [10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.0, 9.9, 9.8];
    getAll.mockResolvedValue(
      ok([
        lane({
          id: 'lane-1',
          channel: 3,
          player: { name: 'Alex Smith', affiliation: 'Tokyo' },
          matchShots: shots,
          stage1Total: 104.5,
          stage2Total: 19.7,
          totalScore: 124.2,
        }),
        lane({
          id: 'lane-2',
          channel: 4,
          matchShots: shots.slice(0, 10),
          stage1Total: 103.5,
          totalScore: 103.5,
          eliminated: true,
        }),
        lane({ id: 'lane-3', channel: 5, player: { name: 'Not selected', affiliation: 'X' } }),
      ]),
    );

    const { container } = render(<ScoreSheetPrintScreen config={config(['lane-1', 'lane-2'])} />);

    await screen.findByText('Alex Smith');
    expect(rows(container)).toMatchInlineSnapshot(`
      [
        "1|Alex Smith|Tokyo|51.5|104.5|124.2|124.2|124.2|124.2|124.2|124.2|124.2|124.2|",
        "10.1|10.6|9.9|-|-|-|-|-|-",
        "10.2|10.7|9.8|-|-|-|-|-|-",
        "10.3|10.8| | | | | | | ",
        "10.4|10.9| | | | | | | ",
        "10.5|10.0| | | | | | | ",
        "99|Unregistered|-|51.5|103.5|—|—|—|—|—|—|—|103.5|E10",
        "10.1|10.6|—|—|—|—|—|—|—",
        "10.2|10.7|—|—|—|—|—|—|—",
        "10.3|10.8| | | | | | | ",
        "10.4|10.9| | | | | | | ",
        "10.5|10.0| | | | | | | ",
      ]
    `);
  });

  it('shows the print error texts', async () => {
    render(<ScoreSheetPrintScreen config={config([])} />);
    expect(screen.getByText('No Lanes were selected for printing')).toBeInTheDocument();
    cleanup();

    getScoreSheets.mockResolvedValue(fail('Lane store unavailable'));
    getAll.mockResolvedValue(ok([lane({ id: 'other' })]));
    render(<ScoreSheetPrintScreen config={config(['lane-1'])} />);
    expect(await screen.findByText('No printable data was found')).toBeInTheDocument();
    cleanup();

    getScoreSheets.mockRejectedValue(new Error('IPC closed'));
    render(<ScoreSheetPrintScreen config={config(['lane-1'])} />);
    expect(await screen.findByText('IPC closed')).toBeInTheDocument();
    cleanup();

    getScoreSheets.mockRejectedValue('raw');
    render(<ScoreSheetPrintScreen config={config(['lane-1'])} />);
    expect(await screen.findByText('Failed to retrieve score sheets')).toBeInTheDocument();
  });
});

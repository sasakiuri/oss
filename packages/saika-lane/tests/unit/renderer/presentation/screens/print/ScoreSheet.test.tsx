// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScoreSheet } from '@/renderer/presentation/screens/print/components/ScoreSheet';
import type { ScoreSheetDto } from '@/shared/ipc/contracts';

function buildScoreSheetDto(overrides?: Partial<ScoreSheetDto>): ScoreSheetDto {
  return {
    sessionId: 'session-001',
    laneNumber: 3,
    relay: 0,
    playerName: 'Test Player',
    affiliation: 'Test Club',
    allShots: [
      { shotNumber: 1, value: 105, integerValue: 10, seriesNumber: 1, x: null, y: null },
      { shotNumber: 2, value: 98, integerValue: 9, seriesNumber: 1, x: null, y: null },
      { shotNumber: 3, value: 83, integerValue: 8, seriesNumber: 1, x: null, y: null },
    ],
    seriesScores: [286],
    totalScore: 286,
    totalIntegerScore: 27,
    disciplineName: '10m Air Rifle',
    discipline: 'AIR_RIFLE_10M',
    ...overrides,
  };
}

describe('ScoreSheet', () => {
  it('displays the discipline name', () => {
    render(<ScoreSheet data={buildScoreSheetDto()} />);
    expect(screen.getByText('10m Air Rifle')).toBeInTheDocument();
  });

  it('displays the lane number (lane number only when relay=0)', () => {
    render(<ScoreSheet data={buildScoreSheetDto({ laneNumber: 3, relay: 0 })} />);
    expect(screen.getByText('Lane: 3')).toBeInTheDocument();
  });

  it('displays the lane number (relay-laneNumber format when relay>0)', () => {
    render(<ScoreSheet data={buildScoreSheetDto({ laneNumber: 5, relay: 2 })} />);
    expect(screen.getByText('Lane: 2-5')).toBeInTheDocument();
  });

  it('displays the total score', () => {
    const { container } = render(<ScoreSheet data={buildScoreSheetDto({ totalScore: 286, totalIntegerScore: 27 })} />);
    const resultRow = container.querySelector('.result-row');
    expect(resultRow).toBeInTheDocument();
    expect(resultRow!.querySelector('.decimal-main')!.textContent).toBe('28.6');
    expect(resultRow!.querySelector('.integer-sub')!.textContent).toBe('(27)');
  });

  it('displays the player name and affiliation', () => {
    render(<ScoreSheet data={buildScoreSheetDto({ playerName: 'Taro', affiliation: 'Club A' })} />);
    expect(screen.getByText('Taro – Club A')).toBeInTheDocument();
  });

  it('displays only the player name when affiliation is empty', () => {
    render(<ScoreSheet data={buildScoreSheetDto({ playerName: 'Taro', affiliation: '' })} />);
    expect(screen.getByText('Taro')).toBeInTheDocument();
  });

  it('displays shot values formatted', () => {
    render(<ScoreSheet data={buildScoreSheetDto()} />);
    expect(screen.getByText('10.5')).toBeInTheDocument();
    expect(screen.getByText('9.8')).toBeInTheDocument();
    expect(screen.getByText('8.3')).toBeInTheDocument();
  });

  it('displays at least 6 series slots', () => {
    const { container } = render(<ScoreSheet data={buildScoreSheetDto()} />);
    const seriesBlocks = container.querySelectorAll('.series-block');
    expect(seriesBlocks.length).toBeGreaterThanOrEqual(6);
  });

  it('does not crash when there are no shots', () => {
    const dto = buildScoreSheetDto({
      allShots: [],
      seriesScores: [],
      totalScore: 0,
      totalIntegerScore: 0,
    });
    const { container } = render(<ScoreSheet data={dto} />);
    expect(container.querySelector('.score-sheet')).toBeInTheDocument();
  });
});

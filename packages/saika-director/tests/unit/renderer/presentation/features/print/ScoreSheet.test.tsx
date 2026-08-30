import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoreSheet } from '@/renderer/presentation/features/print/components/ScoreSheet';

describe('ScoreSheet', () => {
  it('prints an assigned no-shot miss as M', () => {
    render(
      <ScoreSheet
        data={{
          laneId: 'lane-1',
          channel: 1,
          relay: 1,
          playerName: 'Athlete',
          affiliation: 'Club',
          allShots: [
            {
              shotNumber: 1,
              value: 0,
              integerValue: 0,
              seriesNumber: 1,
              disposition: 'MISS',
            },
          ],
          seriesScores: [0, 0, 0, 0, 0, 0],
          totalScore: 0,
          totalIntegerScore: 0,
        }}
      />,
    );

    expect(screen.getByText('M')).toBeInTheDocument();
  });
});

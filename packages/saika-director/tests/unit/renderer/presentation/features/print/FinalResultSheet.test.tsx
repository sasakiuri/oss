import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FinalResultSheet } from '@/renderer/presentation/features/print/components/FinalResultSheet';

describe('FinalResultSheet', () => {
  it('prints projected series cumulatives and flags a placement-affecting intervention', () => {
    const { container } = render(
      <FinalResultSheet
        championship={{ name: 'Championship', date: 'August 29, 2026', venue: 'Range' }}
        event={{ name: 'Final', eventType: 'BR60S_FINAL' }}
        results={[
          {
            rank: 1,
            firingPointNumber: 1,
            playerName: 'Final Athlete',
            affiliation: 'Team',
            stage1Shots: Array.from({ length: 10 }, () => 10),
            stage1Total: 100,
            stage2Shots: [10, 10],
            stage2Total: 19,
            seriesScores: [50, 50, 19],
            seriesShotCounts: [5, 5, 2],
            totalScore: 119,
            scoreAdjustment: 1,
            placementReviewRequired: true,
            remarks: 'One-point deduction',
          },
        ]}
      />,
    );

    const firstStage2Cumulative = container.querySelector('.col-stage2-cumulative.cumulative-cell');
    expect(firstStage2Cumulative).toHaveTextContent('119.0');
    expect(screen.getByText(/Adjustment -1\.0/)).toHaveTextContent('Placement review required');
  });

  it('prints a classification code instead of a numeric rank and total', () => {
    render(
      <FinalResultSheet
        championship={{ name: 'Championship', date: 'August 29, 2026', venue: 'Range' }}
        event={{ name: 'Final', eventType: 'BR60S_FINAL' }}
        results={[
          {
            rank: 0,
            firingPointNumber: 2,
            playerName: 'Classified Athlete',
            affiliation: 'Team',
            stage1Shots: Array.from({ length: 10 }, () => 10),
            stage1Total: 100,
            stage2Shots: [],
            stage2Total: 0,
            totalScore: 0,
            classificationCode: 'AD_DSQ',
            remarks: 'Equipment control failure',
          },
        ]}
      />,
    );

    expect(screen.getByText('AD-DSQ')).toBeInTheDocument();
    expect(screen.getAllByText('—')).not.toHaveLength(0);
  });
});

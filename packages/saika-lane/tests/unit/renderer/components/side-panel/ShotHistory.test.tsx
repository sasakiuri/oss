// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ShotHistory } from '@/renderer/presentation/components/side-panel/ShotHistory';

const createShot = (shotNumber: number, score: number, x = 0, y = 0) => ({
  id: `shot-${shotNumber}`,
  shotNumber,
  score,
  x,
  y,
});

describe('ShotHistory', () => {
  it('displays nothing when shots are empty', () => {
    const { container } = render(<ShotHistory shots={[]} />);
    expect(container.textContent).toBe('');
  });

  it('merges extras by receipt time, preserves ordinary ordinals and shows raw mode on later sighters', () => {
    const shots = [
      {
        ...createShot(21, 90),
        receivedAt: '2026-10-30T01:00:02Z',
        reportedMode: 'MATCH' as const,
        competitionContext: { competitionId: 'comp-1', stageIndex: 1, seriesIndex: 2 },
      },
    ];
    const { container } = render(
      <ShotHistory
        shots={shots}
        nullifiedExtras={[
          {
            id: 'extra',
            receivedAt: '2026-10-30T01:00:01Z',
            reportedMode: 'MATCH',
            deviceScoreX10: 100,
            previousPositionLabel: 'previous Prone position',
            competitionContext: { competitionId: 'comp-1', stageIndex: 1, seriesIndex: 2 },
            detail: 'ISSF 6.10.4(c) / 7.7.3',
          },
        ]}
      />,
    );
    expect(screen.getByText(/Nullified extra — previous Prone position/)).toBeVisible();
    expect(screen.getByLabelText('No shot ordinal')).toHaveTextContent('—');
    expect(screen.getAllByText(/Reported mode: MATCH/)).toHaveLength(2);
    expect(container.textContent!.indexOf('21')).toBeLessThan(container.textContent!.indexOf('Nullified extra'));
  });

  it.each([
    undefined,
    null,
    { competitionId: 'other', stageIndex: 1, seriesIndex: 2 },
    { competitionId: 'comp-1', stageIndex: 0, seriesIndex: 2 },
    { competitionId: 'comp-1', stageIndex: 1, seriesIndex: 3 },
  ])('keeps reported modes out of unrelated series and training rows: %s', (competitionContext) => {
    render(
      <ShotHistory
        shots={[{ ...createShot(1, 97), competitionContext, reportedMode: 'MATCH' }]}
        nullifiedExtras={[
          {
            id: 'extra',
            receivedAt: '2026-10-30T01:00:01Z',
            reportedMode: 'MATCH',
            deviceScoreX10: 100,
            previousPositionLabel: 'previous Prone position',
            detail: null,
            competitionContext: { competitionId: 'comp-1', stageIndex: 1, seriesIndex: 2 },
          },
        ]}
      />,
    );
    expect(screen.getAllByText(/Reported mode: MATCH/)).toHaveLength(1);
  });

  it('does not show reported mode without a nullified extra in the series', () => {
    render(
      <ShotHistory
        shots={[
          {
            ...createShot(1, 97),
            reportedMode: 'MATCH',
            competitionContext: { competitionId: 'comp-1', stageIndex: 1, seriesIndex: 2 },
          },
        ]}
      />,
    );
    expect(screen.queryByText(/Reported mode:/)).not.toBeInTheDocument();
  });

  it.each([
    ['RING', '9'],
    ['DECIMAL', '9.7'],
  ] as const)('formats an extra device value using %s scoring', (acc, value) => {
    render(
      <ShotHistory
        shots={[]}
        acc={acc}
        nullifiedExtras={[
          {
            id: 'extra',
            receivedAt: '2026-10-30T01:00:01Z',
            reportedMode: null,
            deviceScoreX10: 97,
            previousPositionLabel: 'previous Prone position',
            detail: null,
            competitionContext: null,
          },
        ]}
      />,
    );
    expect(screen.getByText('Device value: ' + value + ' · Reported mode: Unknown')).toBeVisible();
  });

  it('displays a single shot correctly', () => {
    const shots = [createShot(1, 105, 0, 10)];
    render(<ShotHistory shots={shots} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('10.5')).toBeInTheDocument();
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('displays multiple shots correctly', () => {
    const shots = [createShot(3, 102, 5, 5), createShot(2, 98, -5, 0), createShot(1, 100, 0, 0)];
    render(<ShotHistory shots={shots} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('10.2')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('9.8')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('10.0')).toBeInTheDocument();
  });

  it('displays shot number, score, and arrow direction', () => {
    const shots = [createShot(5, 87, 10, -10)];
    render(<ShotHistory shots={shots} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('8.7')).toBeInTheDocument();
    expect(screen.getByText('↘')).toBeInTheDocument();
  });

  it('displays a center dot for center shot (0,0)', () => {
    const shots = [createShot(1, 109, 0, 0)];
    render(<ShotHistory shots={shots} />);

    expect(screen.getByText('•')).toBeInTheDocument();
  });

  it('displays scores with one decimal place', () => {
    const shots = [createShot(1, 100)];
    render(<ShotHistory shots={shots} />);

    expect(screen.getByText('10.0')).toBeInTheDocument();
  });

  it('can display 10 shots', () => {
    const shots = Array.from({ length: 10 }, (_, i) => createShot(10 - i, 100 - i));
    render(<ShotHistory shots={shots} />);

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('has a scrollable container', () => {
    const { container } = render(<ShotHistory shots={[]} />);
    const scrollContainer = container.querySelector('.overflow-y-auto');
    expect(scrollContainer).toBeInTheDocument();
  });

  describe('acc (scoring method)', () => {
    it('displays with one decimal place in DECIMAL mode (default)', () => {
      const shots = [createShot(1, 97)];
      render(<ShotHistory shots={shots} acc="DECIMAL" />);
      expect(screen.getByText('9.7')).toBeInTheDocument();
    });

    it('displays as integer in RING mode (97 -> 9)', () => {
      const shots = [createShot(1, 97)];
      render(<ShotHistory shots={shots} acc="RING" />);
      expect(screen.getByText('9')).toBeInTheDocument();
      expect(screen.queryByText('9.7')).not.toBeInTheDocument();
    });

    it('displays integer score as-is in RING mode (100 -> 10)', () => {
      const shots = [createShot(1, 100)];
      render(<ShotHistory shots={shots} acc="RING" />);
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('behaves as DECIMAL when acc is omitted', () => {
      const shots = [createShot(1, 83)];
      render(<ShotHistory shots={shots} />);
      expect(screen.getByText('8.3')).toBeInTheDocument();
    });
  });
});

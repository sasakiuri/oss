// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SeriesScoreGrid } from '@/renderer/presentation/components/side-panel/SeriesScoreGrid';

describe('SeriesScoreGrid', () => {
  it('displays nothing when scores are empty', () => {
    const { container } = render(<SeriesScoreGrid scores={[]} acc="DECIMAL" />);
    const italic = container.querySelector('.italic');
    expect(italic).toBeInTheDocument();
  });

  it('displays a single series score', () => {
    render(<SeriesScoreGrid scores={[955]} acc="DECIMAL" />);
    expect(screen.getByText('95.5')).toBeInTheDocument();
  });

  it('displays 3 series scores in one row', () => {
    render(<SeriesScoreGrid scores={[1000, 985, 970]} acc="DECIMAL" />);
    expect(screen.getByText('100.0')).toBeInTheDocument();
    expect(screen.getByText('98.5')).toBeInTheDocument();
    expect(screen.getByText('97.0')).toBeInTheDocument();
  });

  it('displays 4 series scores in 2 rows (3+1)', () => {
    const { container } = render(<SeriesScoreGrid scores={[1000, 980, 960, 940]} acc="DECIMAL" />);
    // 3-column grid in 2 rows
    const rows = container.querySelectorAll('.grid-cols-3');
    expect(rows).toHaveLength(2);
  });

  it('displays 6 series scores in 2 rows (3+3)', () => {
    const scores = [1000, 990, 980, 970, 960, 950];
    const { container } = render(<SeriesScoreGrid scores={scores} acc="DECIMAL" />);
    const rows = container.querySelectorAll('.grid-cols-3');
    expect(rows).toHaveLength(2);
    scores.forEach((score) => {
      expect(screen.getByText((score / 10).toFixed(1))).toBeInTheDocument();
    });
  });

  it('displays scores with one decimal place', () => {
    render(<SeriesScoreGrid scores={[1000]} acc="DECIMAL" />);
    expect(screen.getByText('100.0')).toBeInTheDocument();
  });

  it('displays integer scores when acc=RING', () => {
    render(<SeriesScoreGrid scores={[955]} acc="RING" />);
    expect(screen.getByText('95')).toBeInTheDocument();
  });

  it('has a scrollable container', () => {
    const { container } = render(<SeriesScoreGrid scores={[]} acc="DECIMAL" />);
    const scrollContainer = container.querySelector('.overflow-y-auto');
    expect(scrollContainer).toBeInTheDocument();
  });

  it('has a fixed height (h-40)', () => {
    const { container } = render(<SeriesScoreGrid scores={[]} acc="DECIMAL" />);
    const panel = container.querySelector('.h-40');
    expect(panel).toBeInTheDocument();
  });
});

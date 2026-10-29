// SPDX-License-Identifier: MIT
import { fireEvent, render, screen } from '@testing-library/react';
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

  function mockViewport(viewport: HTMLElement, initialScrollHeight: number) {
    let scrollHeight = initialScrollHeight;
    let scrollTop = 0;
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, get: () => 100 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = Math.max(0, Math.min(value, scrollHeight - 100));
        },
      },
    });
    return (height: number) => {
      scrollHeight = height;
    };
  }

  it('follows new rows after both the seventh and tenth series are added', () => {
    const scores = Array.from({ length: 10 }, (_, i) => 1000 - i);
    const { rerender } = render(<SeriesScoreGrid scores={scores.slice(0, 6)} acc="DECIMAL" />);
    const viewport = screen.getByRole('region', { name: 'Series scores' });
    const setScrollHeight = mockViewport(viewport, 100);

    setScrollHeight(152);
    rerender(<SeriesScoreGrid scores={scores.slice(0, 7)} acc="DECIMAL" />);
    expect(viewport.scrollTop).toBe(52);
    fireEvent.scroll(viewport);

    setScrollHeight(204);
    rerender(<SeriesScoreGrid scores={scores} acc="DECIMAL" />);
    expect(viewport.scrollTop).toBe(104);
  });

  it('preserves an older row during updates and follows again after returning to the bottom', () => {
    const scores = Array.from({ length: 16 }, (_, i) => 1000 - i);
    const { rerender } = render(<SeriesScoreGrid scores={scores.slice(0, 10)} acc="DECIMAL" />);
    const viewport = screen.getByRole('region', { name: 'Series scores' });
    const setScrollHeight = mockViewport(viewport, 204);
    fireEvent.scroll(viewport);

    setScrollHeight(256);
    rerender(<SeriesScoreGrid scores={scores.slice(0, 13)} acc="DECIMAL" />);
    expect(viewport.scrollTop).toBe(0);

    viewport.scrollTop = 156;
    fireEvent.scroll(viewport);
    setScrollHeight(308);
    rerender(<SeriesScoreGrid scores={scores} acc="DECIMAL" />);
    expect(viewport.scrollTop).toBe(208);
  });

  it('resumes following after the scores are cleared for a new session', () => {
    const scores = Array.from({ length: 7 }, (_, i) => 1000 - i);
    const { rerender } = render(<SeriesScoreGrid scores={scores} acc="DECIMAL" />);
    const viewport = screen.getByRole('region', { name: 'Series scores' });
    const setScrollHeight = mockViewport(viewport, 152);
    fireEvent.scroll(viewport);

    setScrollHeight(0);
    rerender(<SeriesScoreGrid scores={[]} acc="DECIMAL" />);
    setScrollHeight(152);
    rerender(<SeriesScoreGrid scores={scores} acc="DECIMAL" />);
    expect(viewport.scrollTop).toBe(52);
  });
});

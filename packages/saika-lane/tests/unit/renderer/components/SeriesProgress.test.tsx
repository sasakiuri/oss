// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SeriesProgress } from '@/renderer/presentation/components/side-panel/SeriesProgress';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';

describe('SeriesProgress', () => {
  beforeEach(() => {
    useCompetitionStore.getState().resetCompetition();
  });

  it('renders nothing during IDLE phase', () => {
    const { container } = render(<SeriesProgress />);
    expect(container.innerHTML).toBe('');
  });

  it('displays the series number during ACTIVE phase (seriesIndex=0 -> "Series 1")', () => {
    useCompetitionStore.setState({ phase: 'ACTIVE', seriesIndex: 0 });

    render(<SeriesProgress />);

    expect(screen.getByText('Series 1')).toBeInTheDocument();
  });

  it('displays "Series 3" when seriesIndex=2', () => {
    useCompetitionStore.setState({ phase: 'ACTIVE', seriesIndex: 2 });

    render(<SeriesProgress />);

    expect(screen.getByText('Series 3')).toBeInTheDocument();
  });

  it('displays "Series 6" when seriesIndex=5', () => {
    useCompetitionStore.setState({ phase: 'ACTIVE', seriesIndex: 5 });

    render(<SeriesProgress />);

    expect(screen.getByText('Series 6')).toBeInTheDocument();
  });

  it('displays the series number during SERIES_COMPLETE phase', () => {
    useCompetitionStore.setState({ phase: 'SERIES_COMPLETE', seriesIndex: 1 });

    render(<SeriesProgress />);

    expect(screen.getByText('Series 2')).toBeInTheDocument();
  });

  it('displays the series number during FINISHED phase', () => {
    useCompetitionStore.setState({ phase: 'FINISHED', seriesIndex: 5 });

    render(<SeriesProgress />);

    expect(screen.getByText('Series 6')).toBeInTheDocument();
  });

  it('displays the series number during SERIES_ENTERED phase', () => {
    useCompetitionStore.setState({ phase: 'SERIES_ENTERED', seriesIndex: 1 });

    render(<SeriesProgress />);

    expect(screen.getByText('Series 2')).toBeInTheDocument();
  });

  it('displays the series number during STAGE_ENTERED phase', () => {
    useCompetitionStore.setState({ phase: 'STAGE_ENTERED', seriesIndex: 0 });

    render(<SeriesProgress />);

    expect(screen.getByText('Series 1')).toBeInTheDocument();
  });
});

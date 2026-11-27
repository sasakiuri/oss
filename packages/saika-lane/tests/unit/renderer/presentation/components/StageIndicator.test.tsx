// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { StageIndicator } from '@/renderer/presentation/components/StageIndicator';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';

describe('StageIndicator', () => {
  beforeEach(() => {
    useCompetitionStore.getState().resetCompetition();
  });

  it('renders nothing during IDLE phase', () => {
    const { container } = render(<StageIndicator />);
    expect(container.innerHTML).toBe('');
  });

  it('displays "Preparation" during ACTIVE phase with !scored', () => {
    useCompetitionStore.setState({ phase: 'ACTIVE', scored: false });

    render(<StageIndicator />);

    const label = screen.getByText('Preparation');
    expect(label).toBeInTheDocument();
    expect(label.className).toContain('text-blue-400');
  });

  it('displays "Match" during ACTIVE phase with scored', () => {
    useCompetitionStore.setState({ phase: 'ACTIVE', scored: true });

    render(<StageIndicator />);

    const label = screen.getByText('Match');
    expect(label).toBeInTheDocument();
    expect(label.className).toContain('text-red-400');
  });

  it('displays "Series Complete" during SERIES_COMPLETE phase', () => {
    useCompetitionStore.setState({ phase: 'SERIES_COMPLETE' });

    render(<StageIndicator />);

    const label = screen.getByText('Series Complete');
    expect(label).toBeInTheDocument();
    expect(label.className).toContain('text-yellow-400');
  });

  it('displays "Next Series" during SERIES_ENTERED phase', () => {
    useCompetitionStore.setState({ phase: 'SERIES_ENTERED' });

    render(<StageIndicator />);

    const label = screen.getByText('Next Series');
    expect(label).toBeInTheDocument();
    expect(label.className).toContain('text-green-400');
  });

  it('displays "Next Stage" during STAGE_ENTERED phase', () => {
    useCompetitionStore.setState({ phase: 'STAGE_ENTERED' });

    render(<StageIndicator />);

    const label = screen.getByText('Next Stage');
    expect(label).toBeInTheDocument();
    expect(label.className).toContain('text-green-400');
  });

  it('displays "Finished" during FINISHED phase', () => {
    useCompetitionStore.setState({ phase: 'FINISHED' });

    render(<StageIndicator />);

    const label = screen.getByText('Finished');
    expect(label).toBeInTheDocument();
    expect(label.className).toContain('text-gray-400');
  });

  it('renders the label as a span element', () => {
    useCompetitionStore.setState({ phase: 'ACTIVE', scored: true });

    render(<StageIndicator />);

    const label = screen.getByText('Match');
    expect(label.tagName).toBe('SPAN');
  });

  it('applies the font size class', () => {
    useCompetitionStore.setState({ phase: 'ACTIVE', scored: true });

    render(<StageIndicator />);

    const label = screen.getByText('Match');
    expect(label.className).toContain('text-4xl');
    expect(label.className).toContain('font-medium');
  });
});

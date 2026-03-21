// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { TimerDisplay } from '@/renderer/presentation/components/side-panel/TimerDisplay';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';

describe('TimerDisplay', () => {
  beforeEach(() => {
    useCompetitionStore.getState().resetCompetition();
  });

  it('renders nothing during IDLE phase', () => {
    const { container } = render(<TimerDisplay />);
    expect(container.innerHTML).toBe('');
  });

  it('displays the timer during ACTIVE phase (derived from remainingSeconds)', () => {
    useCompetitionStore.setState({
      phase: 'ACTIVE',
      remainingSeconds: 300,
      totalSeconds: 300,
    });

    render(<TimerDisplay />);

    expect(screen.getByText('05:00')).toBeInTheDocument();
  });

  it('applies the blue class when more than 60 seconds remain', () => {
    useCompetitionStore.setState({
      phase: 'ACTIVE',
      remainingSeconds: 120,
      totalSeconds: 300,
    });

    render(<TimerDisplay />);

    const timerText = screen.getByText('02:00');
    expect(timerText.className).toContain('text-blue-400');
  });

  it('applies the yellow class when 60 seconds or fewer remain', () => {
    useCompetitionStore.setState({
      phase: 'ACTIVE',
      remainingSeconds: 50,
      totalSeconds: 300,
    });

    render(<TimerDisplay />);

    const timerText = screen.getByText('00:50');
    expect(timerText.className).toContain('text-yellow-500');
  });

  it('applies the red class when 30 seconds or fewer remain', () => {
    useCompetitionStore.setState({
      phase: 'ACTIVE',
      remainingSeconds: 25,
      totalSeconds: 300,
    });

    render(<TimerDisplay />);

    const timerText = screen.getByText('00:25');
    expect(timerText.className).toContain('text-red-500');
  });

  it('applies the red class when 0 seconds remain', () => {
    useCompetitionStore.setState({
      phase: 'ACTIVE',
      remainingSeconds: 0,
      totalSeconds: 300,
    });

    render(<TimerDisplay />);

    const timerText = screen.getByText('00:00');
    expect(timerText.className).toContain('text-red-500');
  });

  it('displays the progress bar', () => {
    useCompetitionStore.setState({
      phase: 'ACTIVE',
      remainingSeconds: 150,
      totalSeconds: 300,
    });

    const { container } = render(<TimerDisplay />);

    const progressBar = container.querySelector('[style]');
    expect(progressBar).not.toBeNull();
    expect(progressBar!.getAttribute('style')).toContain('width: 50%');
  });

  it('sets the progress bar width to 0% when totalSeconds is 0', () => {
    useCompetitionStore.setState({
      phase: 'ACTIVE',
      remainingSeconds: 0,
      totalSeconds: 0,
    });

    const { container } = render(<TimerDisplay />);

    const progressBar = container.querySelector('[style]');
    expect(progressBar).not.toBeNull();
    expect(progressBar!.getAttribute('style')).toContain('width: 0%');
  });

  it('displays the timer during SERIES_COMPLETE phase', () => {
    useCompetitionStore.setState({
      phase: 'SERIES_COMPLETE',
      remainingSeconds: 0,
      totalSeconds: 300,
    });

    render(<TimerDisplay />);

    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('displays the timer during FINISHED phase', () => {
    useCompetitionStore.setState({
      phase: 'FINISHED',
      remainingSeconds: 0,
      totalSeconds: 300,
    });

    render(<TimerDisplay />);

    expect(screen.getByText('00:00')).toBeInTheDocument();
  });
});

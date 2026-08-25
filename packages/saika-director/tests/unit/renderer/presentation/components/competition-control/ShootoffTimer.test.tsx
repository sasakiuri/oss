import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShootoffTimer } from '@/renderer/presentation/features/competition-control/components/ShootoffTimer';

describe('ShootoffTimer', () => {
  const defaultProps = {
    timerSeconds: 50,
    timerRunning: false,
    onStart: vi.fn(),
    onPause: vi.fn(),
    onReset: vi.fn(),
  };

  it('should display formatted time', () => {
    render(<ShootoffTimer {...defaultProps} timerSeconds={125} />);
    expect(screen.getByText('02:05')).toBeDefined();
  });

  it('should display 00:00 for zero seconds', () => {
    render(<ShootoffTimer {...defaultProps} timerSeconds={0} />);
    expect(screen.getByText('00:00')).toBeDefined();
  });

  it('should display 00:50 for 50 seconds', () => {
    render(<ShootoffTimer {...defaultProps} timerSeconds={50} />);
    expect(screen.getByText('00:50')).toBeDefined();
  });

  it('should show start button when not running', () => {
    render(<ShootoffTimer {...defaultProps} timerRunning={false} />);
    expect(screen.getByTitle('Start')).toBeDefined();
  });

  it('should show pause button when running', () => {
    render(<ShootoffTimer {...defaultProps} timerRunning={true} />);
    expect(screen.getByTitle('Pause')).toBeDefined();
  });

  it('should call onStart when start button is clicked', () => {
    const onStart = vi.fn();
    render(<ShootoffTimer {...defaultProps} onStart={onStart} timerRunning={false} />);
    fireEvent.click(screen.getByTitle('Start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('should call onPause when pause button is clicked', () => {
    const onPause = vi.fn();
    render(<ShootoffTimer {...defaultProps} onPause={onPause} timerRunning={true} />);
    fireEvent.click(screen.getByTitle('Pause'));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('should call onReset when reset button is clicked', () => {
    const onReset = vi.fn();
    render(<ShootoffTimer {...defaultProps} onReset={onReset} />);
    fireEvent.click(screen.getByTitle('Reset'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('should show reset button always', () => {
    render(<ShootoffTimer {...defaultProps} />);
    expect(screen.getByTitle('Reset')).toBeDefined();
  });

  it('should apply red text when timer <= 10 seconds', () => {
    const { container } = render(<ShootoffTimer {...defaultProps} timerSeconds={5} />);
    const timeSpan = container.querySelector('.text-3xl');
    expect(timeSpan?.className).toContain('text-red-400');
  });

  it('should apply normal text when timer > 10 seconds', () => {
    const { container } = render(<ShootoffTimer {...defaultProps} timerSeconds={30} />);
    const timeSpan = container.querySelector('.text-3xl');
    expect(timeSpan?.className).toContain('text-vscode-text');
  });
});

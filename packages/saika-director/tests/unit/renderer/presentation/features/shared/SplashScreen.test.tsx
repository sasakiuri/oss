import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SplashScreen } from '@/renderer/presentation/features/shared/SplashScreen';

describe('SplashScreen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the Director identity, loading state, and application version', () => {
    render(<SplashScreen version="0.3.0" onComplete={vi.fn()} />);

    expect(screen.getByRole('img', { name: 'Saika Director' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'SAIKA DIRECTOR' })).toBeInTheDocument();
    expect(screen.getByText('Multi-Lane Competition Control')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
    expect(screen.getByText('Version 0.3.0')).toBeInTheDocument();
  });

  it('uses the same three-dot loading indicator as Saika Lane', () => {
    const { container } = render(<SplashScreen version="0.3.0" onComplete={vi.fn()} />);

    const dots = container.querySelectorAll('.animate-pulse');
    expect(dots).toHaveLength(3);
    expect(dots[0]).not.toHaveStyle({ animationDelay: '0.2s' });
    expect(dots[1]).toHaveStyle({ animationDelay: '0.2s' });
    expect(dots[2]).toHaveStyle({ animationDelay: '0.4s' });
  });

  it('completes after 2 seconds, matching Saika Lane', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<SplashScreen version="0.3.0" onComplete={onComplete} />);

    act(() => vi.advanceTimersByTime(1999));
    expect(onComplete).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('cancels completion when unmounted', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { unmount } = render(<SplashScreen version="0.3.0" onComplete={onComplete} />);

    unmount();
    act(() => vi.runAllTimers());

    expect(onComplete).not.toHaveBeenCalled();
  });
});

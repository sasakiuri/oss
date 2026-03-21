// SPDX-License-Identifier: MIT
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StatusBar, type StatusBarProps } from '@/renderer/presentation/components/StatusBar';

// ---------- helpers ----------

function defaultProps(overrides: Partial<StatusBarProps> = {}): StatusBarProps {
  return {
    isConnected: false,
    onDebugPanelToggle: vi.fn(),
    ...overrides,
  };
}

// ---------- tests ----------

describe('StatusBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic rendering', () => {
    it('has a contentinfo role', () => {
      render(<StatusBar {...defaultProps()} />);

      expect(screen.getByRole('contentinfo', { name: 'Status Bar' })).toBeInTheDocument();
    });

    it('renders the Debug Panel button', () => {
      render(<StatusBar {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Open Debug Panel' })).toBeInTheDocument();
    });

    it('applies className', () => {
      const { container } = render(<StatusBar {...defaultProps({ className: 'custom' })} />);

      expect(container.firstChild).toHaveClass('custom');
    });
  });

  describe('connection status display', () => {
    it('displays the "Connected" icon when isConnected=true', () => {
      render(<StatusBar {...defaultProps({ isConnected: true })} />);

      expect(screen.getByLabelText('Connected')).toBeInTheDocument();
    });

    it('displays the "Disconnected" icon when isConnected=false', () => {
      render(<StatusBar {...defaultProps({ isConnected: false })} />);

      expect(screen.getByLabelText('Disconnected')).toBeInTheDocument();
    });
  });

  describe('time display', () => {
    it('displays the current time in HH:MM:SS format', () => {
      vi.setSystemTime(new Date(2026, 1, 18, 14, 30, 45));
      render(<StatusBar {...defaultProps()} />);

      expect(screen.getByText('14:30:45')).toBeInTheDocument();
    });

    it('updates the time after 1 second', () => {
      vi.setSystemTime(new Date(2026, 1, 18, 14, 30, 45));
      render(<StatusBar {...defaultProps()} />);

      expect(screen.getByText('14:30:45')).toBeInTheDocument();

      // advanceTimersByTime also advances the fake clock
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText('14:30:46')).toBeInTheDocument();
    });
  });

  describe('debug button', () => {
    it('calls onDebugPanelToggle on click', async () => {
      vi.useRealTimers(); // userEvent requires real timers
      const user = userEvent.setup();
      const onDebugPanelToggle = vi.fn();
      render(<StatusBar {...defaultProps({ onDebugPanelToggle })} />);

      await user.click(screen.getByRole('button', { name: 'Open Debug Panel' }));

      expect(onDebugPanelToggle).toHaveBeenCalledTimes(1);
    });
  });
});

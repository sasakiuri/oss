// SPDX-License-Identifier: MIT
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DebugPane } from '@/renderer/presentation/components/DebugPane';
import type { LogEntry } from '@/shared/types/log';

// Mock useLog hook
const mockClearEntries = vi.fn();
const mockSetAutoScroll = vi.fn();
let mockEntries: LogEntry[] = [];
let mockAutoScroll = true;

vi.mock('@/renderer/presentation/hooks/useLog', () => ({
  useLog: () => ({
    entries: mockEntries,
    autoScroll: mockAutoScroll,
    clearEntries: mockClearEntries,
    setAutoScroll: mockSetAutoScroll,
  }),
}));

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

const createEntry = (overrides?: Partial<LogEntry>): LogEntry => ({
  id: 'log-1',
  timestamp: '2026-01-15T10:30:45.000Z',
  level: 'info',
  message: 'Test log message',
  source: 'main',
  ...overrides,
});

describe('DebugPane', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockEntries = [];
    mockAutoScroll = true;
  });

  describe('basic rendering', () => {
    it('displays "Debug Panel" in the header', () => {
      render(<DebugPane onClose={mockOnClose} />);

      expect(screen.getByText('Debug Panel')).toBeInTheDocument();
    });

    it('displays the entry count', () => {
      mockEntries = [createEntry()];

      render(<DebugPane onClose={mockOnClose} />);

      expect(screen.getByText('1 entries')).toBeInTheDocument();
    });

    it('displays "0 entries" when there are no entries', () => {
      render(<DebugPane onClose={mockOnClose} />);

      expect(screen.getByText('0 entries')).toBeInTheDocument();
    });

    it('applies a custom className', () => {
      const { container } = render(<DebugPane onClose={mockOnClose} className="h-64" />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('h-64');
    });
  });

  describe('empty state', () => {
    it('displays "No log entries" when there are no entries', () => {
      render(<DebugPane onClose={mockOnClose} />);

      expect(screen.getByText('No log entries')).toBeInTheDocument();
    });
  });

  describe('log entry display', () => {
    it('displays the log message', () => {
      mockEntries = [createEntry({ message: 'Connection established' })];

      render(<DebugPane onClose={mockOnClose} />);

      expect(screen.getByText('Connection established')).toBeInTheDocument();
    });

    it('displays the log level', () => {
      mockEntries = [createEntry({ level: 'warn' })];

      render(<DebugPane onClose={mockOnClose} />);

      expect(screen.getByText('warn')).toBeInTheDocument();
    });

    it('displays the log source', () => {
      mockEntries = [createEntry({ source: 'usb' })];

      render(<DebugPane onClose={mockOnClose} />);

      expect(screen.getByText('[usb]')).toBeInTheDocument();
    });

    it('displays multiple log entries', () => {
      mockEntries = [
        createEntry({ id: 'log-1', message: 'First message' }),
        createEntry({ id: 'log-2', message: 'Second message' }),
        createEntry({ id: 'log-3', message: 'Third message' }),
      ];

      render(<DebugPane onClose={mockOnClose} />);

      expect(screen.getByText('First message')).toBeInTheDocument();
      expect(screen.getByText('Second message')).toBeInTheDocument();
      expect(screen.getByText('Third message')).toBeInTheDocument();
    });

    it('displays metadata as JSON when present', () => {
      mockEntries = [
        createEntry({
          metadata: { deviceId: 'MT201', port: '/dev/ttyUSB0' },
        }),
      ];

      render(<DebugPane onClose={mockOnClose} />);

      expect(screen.getByText(/"deviceId": "MT201"/)).toBeInTheDocument();
    });

    it('applies the corresponding color class for each log level', () => {
      mockEntries = [
        createEntry({ id: 'log-debug', level: 'debug', message: 'debug msg' }),
        createEntry({ id: 'log-info', level: 'info', message: 'info msg' }),
        createEntry({ id: 'log-warn', level: 'warn', message: 'warn msg' }),
        createEntry({ id: 'log-error', level: 'error', message: 'error msg' }),
      ];

      render(<DebugPane onClose={mockOnClose} />);

      const debugEl = screen.getByText('debug');
      const infoEl = screen.getByText('info');
      const warnEl = screen.getByText('warn');
      const errorEl = screen.getByText('error');

      expect(debugEl).toHaveClass('text-vscode-text-muted');
      expect(infoEl).toHaveClass('text-vscode-primary');
      expect(warnEl).toHaveClass('text-vscode-warning');
      expect(errorEl).toHaveClass('text-vscode-error');
    });
  });

  describe('actions', () => {
    it('clicking the Clear button calls log clear', () => {
      render(<DebugPane onClose={mockOnClose} />);

      fireEvent.click(screen.getByLabelText('Clear logs'));

      expect(mockClearEntries).toHaveBeenCalledTimes(1);
    });

    it('clicking the close button calls onClose', () => {
      render(<DebugPane onClose={mockOnClose} />);

      fireEvent.click(screen.getByLabelText('Close debug panel'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('changing the Auto-scroll checkbox calls setAutoScroll', () => {
      render(<DebugPane onClose={mockOnClose} />);

      const checkbox = screen.getByLabelText('Auto-scroll');
      fireEvent.click(checkbox);

      expect(mockSetAutoScroll).toHaveBeenCalled();
    });

    it('Auto-scroll checkbox reflects the autoScroll state', () => {
      mockAutoScroll = false;

      render(<DebugPane onClose={mockOnClose} />);

      const checkbox = screen.getByLabelText('Auto-scroll') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });
  });

  describe('timestamp format', () => {
    it('displays the timestamp in HH:mm:ss format', () => {
      // Note: Date parses ISO timestamp in local timezone
      const date = new Date('2026-01-15T10:30:45.000Z');
      const hours = String(date.getHours()).padStart(2, '0');
      const expected = `${hours}:30:45`;

      mockEntries = [createEntry({ timestamp: '2026-01-15T10:30:45.000Z' })];

      render(<DebugPane onClose={mockOnClose} />);

      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });
});

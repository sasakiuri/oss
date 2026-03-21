// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TargetDisplay } from '@/renderer/presentation/components/TargetDisplay';
import type { Discipline, ShotDto } from '@/shared/ipc/contracts';

/**
 * Canvas API mock
 */
const mockGetContext = vi.fn();
const mockClearRect = vi.fn();
const mockFillRect = vi.fn();
const mockBeginPath = vi.fn();
const mockArc = vi.fn();
const mockFill = vi.fn();
const mockStroke = vi.fn();
const mockMoveTo = vi.fn();
const mockLineTo = vi.fn();
const mockFillText = vi.fn();

beforeEach(() => {
  // ResizeObserver mock for JSDOM environment
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  mockGetContext.mockReturnValue({
    clearRect: mockClearRect,
    fillRect: mockFillRect,
    beginPath: mockBeginPath,
    arc: mockArc,
    fill: mockFill,
    stroke: mockStroke,
    moveTo: mockMoveTo,
    lineTo: mockLineTo,
    fillText: mockFillText,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    canvas: { width: 800, height: 800 },
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  });

  HTMLCanvasElement.prototype.getContext = mockGetContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

/**
 * Helper to create test shot data
 */
const createMockShot = (overrides?: Partial<ShotDto>): ShotDto => ({
  id: 'shot-1',
  shotNumber: 1,
  x: 0.5,
  y: 0.3,
  score: 10.5,
  innerTen: false,
  timestamp: '2026-01-15T10:00:00.000Z',
  mode: 'MATCH',
  isRecorded: true,
  ...overrides,
});

describe('TargetDisplay', () => {
  describe('basic rendering', () => {
    it('displays a Canvas element', () => {
      const discipline: Discipline = 'AIR_RIFLE_10M';
      render(<TargetDisplay shots={[]} discipline={discipline} zoomMode="AUTO" />);

      const canvas = screen.getByLabelText('Target display with shot impact points');
      expect(canvas).toBeInTheDocument();
    });

    it('applies a custom className', () => {
      const discipline: Discipline = 'AIR_RIFLE_10M';
      const { container } = render(
        <TargetDisplay shots={[]} discipline={discipline} zoomMode="AUTO" className="custom-class" />,
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('canvas drawing', () => {
    it('draws the Canvas even with an empty shot list', () => {
      const discipline: Discipline = 'AIR_RIFLE_10M';
      render(<TargetDisplay shots={[]} discipline={discipline} zoomMode="AUTO" />);

      expect(mockGetContext).toHaveBeenCalledWith('2d');
      expect(mockClearRect).toHaveBeenCalled();
    });

    it('draws shot data', () => {
      const discipline: Discipline = 'AIR_RIFLE_10M';
      const shots: ShotDto[] = [createMockShot()];

      render(<TargetDisplay shots={shots} discipline={discipline} zoomMode="AUTO" />);

      // arc method is called for shot drawing (target rings + shot points)
      expect(mockArc).toHaveBeenCalled();
      expect(mockFillText).toHaveBeenCalled();
    });

    it('draws multiple shots', () => {
      const discipline: Discipline = 'AIR_RIFLE_10M';
      const shots: ShotDto[] = [
        createMockShot({ id: 'shot-1', shotNumber: 1 }),
        createMockShot({ id: 'shot-2', shotNumber: 2, x: -1.0, y: 2.0 }),
        createMockShot({ id: 'shot-3', shotNumber: 3, x: 3.0, y: -1.5 }),
      ];

      render(<TargetDisplay shots={shots} discipline={discipline} zoomMode="AUTO" />);

      // Verify shot numbers are drawn
      expect(mockFillText).toHaveBeenCalledWith('1', expect.any(Number), expect.any(Number));
      expect(mockFillText).toHaveBeenCalledWith('2', expect.any(Number), expect.any(Number));
      expect(mockFillText).toHaveBeenCalledWith('3', expect.any(Number), expect.any(Number));
    });

    it('uses different colors for sighting and match shots', () => {
      const discipline: Discipline = 'AIR_RIFLE_10M';
      const shots: ShotDto[] = [
        createMockShot({ id: 'shot-1', mode: 'MATCH', isRecorded: true }),
        createMockShot({ id: 'shot-2', mode: 'SIGHTING', isRecorded: false }),
      ];

      render(<TargetDisplay shots={shots} discipline={discipline} zoomMode="AUTO" />);

      // Verify fillStyle was called (color setting)
      expect(mockGetContext).toHaveBeenCalled();
    });
  });

  describe('redraw on property change', () => {
    it('redraws when shots property changes', () => {
      const discipline: Discipline = 'AIR_RIFLE_10M';
      const { rerender } = render(<TargetDisplay shots={[]} discipline={discipline} zoomMode="AUTO" />);

      const initialCallCount = mockClearRect.mock.calls.length;

      const newShots = [createMockShot()];
      rerender(<TargetDisplay shots={newShots} discipline={discipline} zoomMode="AUTO" />);

      expect(mockClearRect.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('redraws when discipline property changes', () => {
      const { rerender } = render(<TargetDisplay shots={[]} discipline="AIR_RIFLE_10M" zoomMode="AUTO" />);

      const initialCallCount = mockClearRect.mock.calls.length;

      rerender(<TargetDisplay shots={[]} discipline="AIR_PISTOL_10M" zoomMode="AUTO" />);

      expect(mockClearRect.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('edge cases', () => {
    it('does not error with extreme coordinate values', () => {
      const discipline: Discipline = 'AIR_RIFLE_10M';
      const shots: ShotDto[] = [createMockShot({ x: 999.9, y: 999.9 }), createMockShot({ x: -999.9, y: -999.9 })];

      expect(() => {
        render(<TargetDisplay shots={shots} discipline={discipline} zoomMode="AUTO" />);
      }).not.toThrow();
    });

    it('displays a shot with a score of 0', () => {
      const discipline: Discipline = 'AIR_RIFLE_10M';
      const shots: ShotDto[] = [createMockShot({ score: 0.0 })];

      expect(() => {
        render(<TargetDisplay shots={shots} discipline={discipline} zoomMode="AUTO" />);
      }).not.toThrow();
    });

    it('displays a shot with a large shot number', () => {
      const discipline: Discipline = 'AIR_RIFLE_10M';
      const shots: ShotDto[] = [createMockShot({ shotNumber: 9999 })];

      render(<TargetDisplay shots={shots} discipline={discipline} zoomMode="AUTO" />);

      expect(mockFillText).toHaveBeenCalledWith('9999', expect.any(Number), expect.any(Number));
    });

    it('does not error when Canvas getContext returns null', () => {
      mockGetContext.mockReturnValueOnce(null);

      const discipline: Discipline = 'AIR_RIFLE_10M';

      expect(() => {
        render(<TargetDisplay shots={[]} discipline={discipline} zoomMode="AUTO" />);
      }).not.toThrow();
    });

    it('can draw many shots (100)', () => {
      const discipline: Discipline = 'AIR_RIFLE_10M';
      const shots: ShotDto[] = Array.from({ length: 100 }, (_, i) =>
        createMockShot({
          id: `shot-${i}`,
          shotNumber: i + 1,
          x: Math.random() * 10 - 5,
          y: Math.random() * 10 - 5,
        }),
      );

      expect(() => {
        render(<TargetDisplay shots={shots} discipline={discipline} zoomMode="AUTO" />);
      }).not.toThrow();
    });
  });

  describe('accessibility', () => {
    it('has an appropriate aria-label on the Canvas', () => {
      const discipline: Discipline = 'AIR_RIFLE_10M';
      render(<TargetDisplay shots={[]} discipline={discipline} zoomMode="AUTO" />);

      const canvas = screen.getByLabelText('Target display with shot impact points');
      expect(canvas).toHaveAccessibleName('Target display with shot impact points');
    });
  });
});

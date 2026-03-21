// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ShotHistory } from '@/renderer/presentation/components/side-panel/ShotHistory';

const createShot = (shotNumber: number, score: number, x = 0, y = 0) => ({
  shotNumber,
  score,
  x,
  y,
});

describe('ShotHistory', () => {
  it('displays nothing when shots are empty', () => {
    const { container } = render(<ShotHistory shots={[]} />);
    // Only an empty italic span
    const italic = container.querySelector('.italic');
    expect(italic).toBeInTheDocument();
  });

  it('displays a single shot correctly', () => {
    const shots = [createShot(1, 105, 0, 10)];
    render(<ShotHistory shots={shots} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('10.5')).toBeInTheDocument();
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('displays multiple shots correctly', () => {
    const shots = [createShot(3, 102, 5, 5), createShot(2, 98, -5, 0), createShot(1, 100, 0, 0)];
    render(<ShotHistory shots={shots} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('10.2')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('9.8')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('10.0')).toBeInTheDocument();
  });

  it('displays shot number, score, and arrow direction', () => {
    const shots = [createShot(5, 87, 10, -10)];
    render(<ShotHistory shots={shots} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('8.7')).toBeInTheDocument();
    expect(screen.getByText('↘')).toBeInTheDocument();
  });

  it('displays a center dot for center shot (0,0)', () => {
    const shots = [createShot(1, 109, 0, 0)];
    render(<ShotHistory shots={shots} />);

    expect(screen.getByText('•')).toBeInTheDocument();
  });

  it('displays scores with one decimal place', () => {
    const shots = [createShot(1, 100)];
    render(<ShotHistory shots={shots} />);

    expect(screen.getByText('10.0')).toBeInTheDocument();
  });

  it('can display 10 shots', () => {
    const shots = Array.from({ length: 10 }, (_, i) => createShot(10 - i, 100 - i));
    render(<ShotHistory shots={shots} />);

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('has a scrollable container', () => {
    const { container } = render(<ShotHistory shots={[]} />);
    const scrollContainer = container.querySelector('.overflow-y-auto');
    expect(scrollContainer).toBeInTheDocument();
  });

  describe('acc (scoring method)', () => {
    it('displays with one decimal place in DECIMAL mode (default)', () => {
      const shots = [createShot(1, 97)];
      render(<ShotHistory shots={shots} acc="DECIMAL" />);
      expect(screen.getByText('9.7')).toBeInTheDocument();
    });

    it('displays as integer in RING mode (97 -> 9)', () => {
      const shots = [createShot(1, 97)];
      render(<ShotHistory shots={shots} acc="RING" />);
      expect(screen.getByText('9')).toBeInTheDocument();
      expect(screen.queryByText('9.7')).not.toBeInTheDocument();
    });

    it('displays integer score as-is in RING mode (100 -> 10)', () => {
      const shots = [createShot(1, 100)];
      render(<ShotHistory shots={shots} acc="RING" />);
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('behaves as DECIMAL when acc is omitted', () => {
      const shots = [createShot(1, 83)];
      render(<ShotHistory shots={shots} />);
      expect(screen.getByText('8.3')).toBeInTheDocument();
    });
  });
});

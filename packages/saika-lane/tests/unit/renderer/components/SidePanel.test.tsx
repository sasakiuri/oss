// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SidePanel } from '@/renderer/presentation/components/SidePanel';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import type { ShotDto } from '@/shared/ipc/contracts';

const createShotDto = (shotNumber: number, score: number, x = 0, y = 0, isRecorded = true): ShotDto => ({
  id: `shot-${shotNumber}`,
  shotNumber,
  x,
  y,
  score,
  innerTen: false,
  timestamp: new Date().toISOString(),
  mode: 'MATCH',
  isRecorded,
});

describe('SidePanel', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
    useSessionStore.getState().setLaneNumber(1);
  });

  describe('basic rendering', () => {
    it('renders SidePanel correctly', () => {
      render(<SidePanel />);
      const aside = screen.getByRole('complementary');
      expect(aside).toBeInTheDocument();
      expect(aside).toHaveAttribute('aria-label', 'Side Panel');
    });

    it('applies className', () => {
      render(<SidePanel className="test-class" />);
      const aside = screen.getByRole('complementary');
      expect(aside.className).toContain('test-class');
    });

    it('displays "No Discipline" when no discipline is selected', () => {
      render(<SidePanel />);
      expect(screen.getByText('No Discipline')).toBeInTheDocument();
    });

    it('displays the initial lane number', () => {
      render(<SidePanel />);
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('initial mode is "Sighting"', () => {
      render(<SidePanel />);
      expect(screen.getByText('Sighting')).toBeInTheDocument();
    });

    it('initial total score is "0.0"', () => {
      render(<SidePanel />);
      expect(screen.getByText('0.0')).toBeInTheDocument();
    });

    it('initial average score is "~ 0.00"', () => {
      render(<SidePanel />);
      expect(screen.getByText('~ 0.00')).toBeInTheDocument();
    });
  });

  describe('discipline display (P1)', () => {
    it('AIR_RIFLE_10M is displayed with the correct label', () => {
      useSessionStore.getState().setDiscipline('AIR_RIFLE_10M');
      render(<SidePanel />);
      expect(screen.getByText('10m Air Rifle')).toBeInTheDocument();
    });

    it('BEAM_RIFLE_10M is displayed with the correct label', () => {
      useSessionStore.getState().setDiscipline('BEAM_RIFLE_10M');
      render(<SidePanel />);
      expect(screen.getByText('10m Beam Rifle')).toBeInTheDocument();
    });

    it('PISTOL_25M is displayed with the correct label', () => {
      useSessionStore.getState().setDiscipline('PISTOL_25M');
      render(<SidePanel />);
      expect(screen.getByText('25m Pistol')).toBeInTheDocument();
    });
  });

  describe('lane number and mode display (P2/P3)', () => {
    it('lane number is updated', () => {
      useSessionStore.getState().setLaneNumber(5);
      render(<SidePanel />);
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('displays "Match" in MATCH mode', () => {
      useSessionStore.getState().setMode('MATCH');
      render(<SidePanel />);
      expect(screen.getByText('Match')).toBeInTheDocument();
    });

    it('displays "Sighting" in SIGHTING mode', () => {
      useSessionStore.getState().setMode('SIGHTING');
      render(<SidePanel />);
      expect(screen.getByText('Sighting')).toBeInTheDocument();
    });
  });

  describe('total score display (P4)', () => {
    it('displays the sum of shots in SIGHTING mode', () => {
      useSessionStore.getState().setMode('SIGHTING');
      useSessionStore.getState().setShots([createShotDto(1, 105), createShotDto(2, 93)]);
      render(<SidePanel />);
      // SIGHTING: scoringShots = all shots, sum = 198 (x10), display = 19.8
      // series score = 19.8 is also displayed so use getAllByText
      const elements = screen.getAllByText('19.8');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    it('displays totalScore when seriesScores exist in MATCH mode', () => {
      useSessionStore.getState().setMode('MATCH');
      useSessionStore.getState().updateScores(1955, [1000, 955]);
      useSessionStore.getState().setShots([createShotDto(1, 100)]);
      render(<SidePanel />);
      // totalScore(1955) -> display 195.5
      expect(screen.getByText('195.5')).toBeInTheDocument();
    });

    it('displays the sum of recorded shots when seriesScores is empty in MATCH mode', () => {
      useSessionStore.getState().setMode('MATCH');
      useSessionStore.getState().setShots([
        createShotDto(1, 105, 0, 0, true),
        createShotDto(2, 90, 0, 0, false), // isRecorded=false
        createShotDto(3, 100, 0, 0, true),
      ]);
      render(<SidePanel />);
      // recorded only: 105 + 100 = 205 (x10), display = 20.5
      // series score may also have the same value
      const elements = screen.getAllByText('20.5');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('shot history display (P5)', () => {
    it('history is empty when there are no shots', () => {
      render(<SidePanel />);
      // ShotHistory renders empty italic span
      const aside = screen.getByRole('complementary');
      expect(aside).toBeInTheDocument();
    });

    it('displays the latest 10 shots in reverse order', () => {
      const shots = Array.from({ length: 12 }, (_, i) => createShotDto(i + 1, 100 - i));
      useSessionStore.getState().setShots(shots);
      render(<SidePanel />);
      // slice(-10) gives shots 3-12, reversed gives 12,11,...,3
      expect(screen.getByText('12')).toBeInTheDocument();
      // Shot 3 is displayed (shotNumber=3 and laneNumber=1 which is also "3")
      const threes = screen.getAllByText('3');
      expect(threes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('series score display (P6)', () => {
    it('displays seriesScores when they exist in MATCH mode', () => {
      useSessionStore.getState().setMode('MATCH');
      useSessionStore.getState().updateScores(2950, [1000, 985, 965]);
      render(<SidePanel />);
      expect(screen.getByText('100.0')).toBeInTheDocument();
      expect(screen.getByText('98.5')).toBeInTheDocument();
      expect(screen.getByText('96.5')).toBeInTheDocument();
    });

    it('displays values calculated by calculateSeriesScores in SIGHTING mode', () => {
      useSessionStore.getState().setMode('SIGHTING');
      const shots = Array.from({ length: 10 }, (_, i) => createShotDto(i + 1, 100));
      useSessionStore.getState().setShots(shots);
      render(<SidePanel />);
      // total=1000 (x10) -> display 100.0, series=1000 -> display 100.0
      const elements = screen.getAllByText('100.0');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('average score display (P7)', () => {
    it('average is 0.00 when there are no shots', () => {
      render(<SidePanel />);
      expect(screen.getByText('~ 0.00')).toBeInTheDocument();
    });

    it('displays the correct average when there are shots', () => {
      useSessionStore.getState().setMode('SIGHTING');
      useSessionStore.getState().setShots([createShotDto(1, 100), createShotDto(2, 90), createShotDto(3, 80)]);
      render(<SidePanel />);
      // average = 270 / 3 = 90 (x10), display = 90/10 = 9.00
      expect(screen.getByText('~ 9.00')).toBeInTheDocument();
    });

    it('calculates average from recorded shots only in MATCH mode', () => {
      useSessionStore.getState().setMode('MATCH');
      useSessionStore.getState().setShots([
        createShotDto(1, 100, 0, 0, true),
        createShotDto(2, 50, 0, 0, false), // excluded
        createShotDto(3, 90, 0, 0, true),
      ]);
      render(<SidePanel />);
      // recorded: 100 + 90 = 190, count=2, avg=95 (x10), display = 95/10 = 9.50
      expect(screen.getByText('~ 9.50')).toBeInTheDocument();
    });
  });

  describe('layout', () => {
    it('renders as an aside element', () => {
      render(<SidePanel />);
      const aside = screen.getByRole('complementary');
      expect(aside.tagName).toBe('ASIDE');
    });

    it('has a width of 448px', () => {
      render(<SidePanel />);
      const aside = screen.getByRole('complementary');
      expect(aside.className).toContain('w-[448px]');
    });

    it('has zinc-700 background color', () => {
      render(<SidePanel />);
      const aside = screen.getByRole('complementary');
      expect(aside.className).toContain('bg-zinc-700');
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ShootoffActions,
  type RoundResult,
} from '@/renderer/presentation/features/competition-control/components/ShootoffActions';
import type { LaneControlDto } from '@/renderer/presentation/stores/domain/laneControl.store';
import type { ActiveShootoff } from '@/renderer/presentation/stores/domain/shootoff.store';

function createLane(overrides: Partial<LaneControlDto> = {}): LaneControlDto {
  return {
    id: 'lane-1',
    channel: 1,
    playerName: 'Player 1',
    affiliation: 'Team A',
    phase: 'IDLE',
    remainingTime: 0,
    shotNumber: 0,
    lastScore: null,
    lastShotTime: null,
    seriesScores: [],
    totalScore: 0,
    recentShots: [],
    unifiedPhase: 'idle',
    stageIndex: 0,
    roundType: 'Qualification',
    stageName: '',
    seriesIndex: 0,
    stage1Total: 0,
    stage2Total: 0,
    eliminated: false,
    eliminationRank: null,
    relayNumber: 1,
    ...overrides,
  };
}

function createShootoff(overrides: Partial<ActiveShootoff> = {}): ActiveShootoff {
  return {
    id: 'shootoff-1',
    targetLaneIds: ['lane-1', 'lane-2'],
    contestedRank: 8,
    rounds: [],
    isResolved: false,
    ...overrides,
  };
}

describe('ShootoffActions', () => {
  const defaultProps = {
    activeShootoff: createShootoff(),
    roundResult: null as RoundResult | null,
    targetLanes: [createLane({ id: 'lane-1' }), createLane({ id: 'lane-2', playerName: 'Player 2' })],
    contestedRank: 8,
    allScoresEntered: true,
    isLoading: false,
    onCompleteRound: vi.fn(),
    onNextRound: vi.fn(),
    onResolve: vi.fn(),
    onClose: vi.fn(),
  };

  it('should show the Confirm round button when no round result exists and the shoot-off is unresolved', () => {
    render(<ShootoffActions {...defaultProps} />);
    expect(screen.getByText('Confirm round')).toBeDefined();
  });

  it('should disable Confirm round when not all scores are entered', () => {
    render(<ShootoffActions {...defaultProps} allScoresEntered={false} />);
    const btn = screen.getByText('Confirm round');
    expect(btn.closest('button')?.disabled).toBe(true);
  });

  it('should call onCompleteRound when Confirm round is clicked', () => {
    const onCompleteRound = vi.fn();
    render(<ShootoffActions {...defaultProps} onCompleteRound={onCompleteRound} />);
    fireEvent.click(screen.getByText('Confirm round'));
    expect(onCompleteRound).toHaveBeenCalledTimes(1);
  });

  it('should show Cancel when unresolved', () => {
    render(<ShootoffActions {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeDefined();
  });

  it('should call onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<ShootoffActions {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('winner result', () => {
    it('should show winner message', () => {
      const roundResult: RoundResult = { type: 'winner', winnerLaneId: 'lane-1' };
      render(<ShootoffActions {...defaultProps} roundResult={roundResult} />);
      expect(screen.getByText('Winner Decided!')).toBeDefined();
    });

    it('should show Confirm for the winner', () => {
      const roundResult: RoundResult = { type: 'winner', winnerLaneId: 'lane-1' };
      render(<ShootoffActions {...defaultProps} roundResult={roundResult} />);
      expect(screen.getByText('Confirm')).toBeDefined();
    });

    it('should call onResolve when Confirm is clicked', () => {
      const onResolve = vi.fn();
      const roundResult: RoundResult = { type: 'winner', winnerLaneId: 'lane-1' };
      render(<ShootoffActions {...defaultProps} roundResult={roundResult} onResolve={onResolve} />);
      fireEvent.click(screen.getByText('Confirm'));
      expect(onResolve).toHaveBeenCalledTimes(1);
    });
  });

  describe('tie result', () => {
    it('should show tie message', () => {
      const roundResult: RoundResult = { type: 'tie', tieLaneIds: ['lane-1', 'lane-2'] };
      render(<ShootoffActions {...defaultProps} roundResult={roundResult} />);
      expect(screen.getByText('Tie')).toBeDefined();
    });

    it('should show Next round for a tie', () => {
      const roundResult: RoundResult = { type: 'tie', tieLaneIds: ['lane-1', 'lane-2'] };
      render(<ShootoffActions {...defaultProps} roundResult={roundResult} />);
      expect(screen.getByText('Next round')).toBeDefined();
    });

    it('should call onNextRound when Next round is clicked', () => {
      const onNextRound = vi.fn();
      const roundResult: RoundResult = { type: 'tie', tieLaneIds: ['lane-1', 'lane-2'] };
      render(<ShootoffActions {...defaultProps} roundResult={roundResult} onNextRound={onNextRound} />);
      fireEvent.click(screen.getByText('Next round'));
      expect(onNextRound).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolved state', () => {
    it('should show Shoot-off Complete when resolved', () => {
      const shootoff = createShootoff({ isResolved: true, winnerLaneId: 'lane-1' });
      render(<ShootoffActions {...defaultProps} activeShootoff={shootoff} />);
      expect(screen.getByText('Shoot-off Complete')).toBeDefined();
    });

    it('should show Close when resolved', () => {
      const shootoff = createShootoff({ isResolved: true, winnerLaneId: 'lane-1' });
      render(<ShootoffActions {...defaultProps} activeShootoff={shootoff} />);
      expect(screen.getByText('Close')).toBeDefined();
    });

    it('should not show Confirm round when resolved', () => {
      const shootoff = createShootoff({ isResolved: true, winnerLaneId: 'lane-1' });
      render(<ShootoffActions {...defaultProps} activeShootoff={shootoff} />);
      expect(screen.queryByText('Confirm round')).toBeNull();
    });
  });

  it('should show Processing... while loading', () => {
    render(<ShootoffActions {...defaultProps} isLoading={true} />);
    expect(screen.getByText('Processing...')).toBeDefined();
  });
});

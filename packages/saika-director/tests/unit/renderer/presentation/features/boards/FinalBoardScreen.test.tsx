import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventBusProvider } from '@/renderer/events/EventBusProvider';
import { TestEventBus } from '@/renderer/events/TestEventBus';
import { FinalBoardScreen } from '@/renderer/presentation/features/boards/FinalBoardScreen';

const { getAll } = vi.hoisted(() => ({ getAll: vi.fn() }));

vi.mock('@/renderer/services', () => ({
  laneControlService: { getAll },
}));

function createLane(roundType: 'Qualification' | 'Final', playerName: string, channel: number) {
  return {
    id: `${roundType.toLowerCase()}-${channel}`,
    channel,
    player: { name: playerName, affiliation: 'Test Team' },
    roundType,
    unifiedPhase: 'FINISHED',
    stageName: 'Finished',
    stageIndex: 2,
    remainingTime: 0,
    matchShots: [10, 10],
    preparationShots: [],
    shootoffShots: [],
    stage1Total: 20,
    stage2Total: 0,
    totalScore: 20,
    eliminated: false,
    eliminationRank: null,
  };
}

describe('FinalBoardScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not include qualification lanes in the final scoreboard', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [createLane('Qualification', 'Qualification Athlete', 1), createLane('Final', 'Final Athlete', 2)],
    });

    render(
      <EventBusProvider bus={new TestEventBus()}>
        <FinalBoardScreen />
      </EventBusProvider>,
    );

    expect(await screen.findByText('Final Athlete')).toBeInTheDocument();
    expect(screen.queryByText('Qualification Athlete')).not.toBeInTheDocument();
  });
});

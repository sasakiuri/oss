// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChampionshipAssignmentPanel } from '@/renderer/presentation/features/competition-control/components/ChampionshipAssignmentPanel';
import { useChampionshipStore } from '@/renderer/presentation/stores/domain/championship.store';
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

const { getChampionships, getChampionshipDetail, getParticipants, getFiringPointAssignments } = vi.hoisted(() => ({
  getChampionships: vi.fn(),
  getChampionshipDetail: vi.fn(),
  getParticipants: vi.fn(),
  getFiringPointAssignments: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  championshipService: {
    getChampionships,
    getChampionshipDetail,
    getParticipants,
    getFiringPointAssignments,
  },
}));

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_ID = '33333333-3333-4333-8333-333333333333';
const LANE_ID = '44444444-4444-4444-8444-444444444444';

function createLane(): DirectorLaneSnapshotDto {
  return {
    laneId: LANE_ID,
    laneAlias: 'Lane 1',
    firingPointNumber: 1,
    hardware: null,
    competitionState: null,
    assignment: null,
    score: null,
    lastRawShot: null,
    lastCompetitionShot: null,
    lastSeenAt: '2026-08-26T00:00:00.000Z',
  };
}

describe('ChampionshipAssignmentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChampionshipStore.getState().reset();
    getChampionships.mockResolvedValue({
      success: true,
      data: {
        championships: [
          {
            id: CHAMPIONSHIP_ID,
            name: 'Test Championship',
            date: '2026-08-26',
            venue: 'Test Range',
            createdAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      },
    });
    getChampionshipDetail.mockResolvedValue({
      success: true,
      data: {
        id: CHAMPIONSHIP_ID,
        name: 'Test Championship',
        date: '2026-08-26',
        venue: 'Test Range',
        createdAt: '2026-08-01T00:00:00.000Z',
        events: [
          {
            id: EVENT_ID,
            name: 'Beam Rifle 60 Shots Standing',
            eventType: 'BR60S',
            round: 'Qualification',
            sortOrder: 0,
          },
        ],
      },
    });
    getParticipants.mockResolvedValue({
      success: true,
      data: {
        participants: [
          {
            id: PARTICIPANT_ID,
            playerName: 'Alex Smith',
            affiliation: 'Tokyo',
            logoPath: null,
            sortOrder: 0,
          },
        ],
      },
    });
    getFiringPointAssignments.mockResolvedValue({
      success: true,
      data: {
        assignments: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            relayNumber: 1,
            firingPointNumber: 1,
            participantId: PARTICIPANT_ID,
          },
        ],
      },
    });
  });

  it('loads championship assignments and passes a plan for applying them to Lanes', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <ChampionshipAssignmentPanel
        activeCompetitionTypeId="BR60S"
        lanes={[createLane()]}
        disabled={false}
        onCompetitionTypeChange={vi.fn()}
        onApply={onApply}
      />,
    );

    await waitFor(() => expect(getChampionships).toHaveBeenCalledOnce());
    fireEvent.change(await screen.findByLabelText('Championship'), { target: { value: CHAMPIONSHIP_ID } });
    await screen.findByRole('option', { name: 'Beam Rifle 60 Shots Standing (BR60S)' });
    fireEvent.change(screen.getByLabelText('Event'), { target: { value: EVENT_ID } });

    await screen.findByText('Relay 1: 1/1 assignments can be applied.');
    const applyButton = screen.getByRole('button', { name: 'Apply assignments' });
    expect(applyButton).toBeEnabled();
    fireEvent.click(applyButton);

    await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      relayNumber: 1,
      assignments: [
        {
          firingPointNumber: 1,
          laneId: LANE_ID,
          athlete: {
            id: PARTICIPANT_ID,
            startNumber: 1,
            name: 'Alex Smith',
          },
        },
      ],
    });
    expect(onApply.mock.calls[0]?.[1]).toEqual({ eventId: EVENT_ID, relayNumber: 1 });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { useChampionshipStore } from '@/renderer/presentation/stores/domain/championship.store';
import type {
  ChampionshipDto,
  ChampionshipDetailResponse,
  ParticipantDto,
  FiringPointAssignmentDto,
} from '@/shared/ipc/contracts/championship.contract';

function createChampionshipDto(overrides: Partial<ChampionshipDto> = {}): ChampionshipDto {
  return {
    id: 'champ-1',
    name: 'Test Championship',
    date: '2026-01-01',
    venue: 'Test Venue',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createChampionshipDetail(overrides: Partial<ChampionshipDetailResponse> = {}): ChampionshipDetailResponse {
  return {
    id: 'champ-1',
    name: 'Test Championship',
    date: '2026-01-01',
    venue: 'Test Venue',
    createdAt: '2026-01-01T00:00:00Z',
    events: [],
    ...overrides,
  };
}

function createParticipant(overrides: Partial<ParticipantDto> = {}): ParticipantDto {
  return {
    id: 'p1',
    playerName: 'Player 1',
    affiliation: 'Team A',
    logoPath: null,
    sortOrder: 1,
    ...overrides,
  };
}

function createAssignment(overrides: Partial<FiringPointAssignmentDto> = {}): FiringPointAssignmentDto {
  return {
    id: 'assign-1',
    relayNumber: 1,
    firingPointNumber: 1,
    participantId: 'p1',
    ...overrides,
  };
}

describe('useChampionshipStore', () => {
  beforeEach(() => {
    useChampionshipStore.getState().reset();
  });

  describe('initial state', () => {
    it('should have empty championships', () => {
      expect(useChampionshipStore.getState().championships).toEqual([]);
    });

    it('should have null selectedChampionship', () => {
      expect(useChampionshipStore.getState().selectedChampionship).toBeNull();
    });

    it('should have null selectedEventId', () => {
      expect(useChampionshipStore.getState().selectedEventId).toBeNull();
    });

    it('should have empty participants', () => {
      expect(useChampionshipStore.getState().participants).toEqual([]);
    });

    it('should have empty firingPointAssignments', () => {
      expect(useChampionshipStore.getState().firingPointAssignments).toEqual([]);
    });
  });

  describe('setChampionships', () => {
    it('should set championships list', () => {
      const champs = [createChampionshipDto({ id: 'c1' }), createChampionshipDto({ id: 'c2' })];

      useChampionshipStore.getState().setChampionships(champs);

      expect(useChampionshipStore.getState().championships).toHaveLength(2);
      expect(useChampionshipStore.getState().championships[0]!.id).toBe('c1');
    });

    it('should replace existing championships', () => {
      useChampionshipStore.getState().setChampionships([createChampionshipDto({ id: 'old' })]);
      useChampionshipStore.getState().setChampionships([createChampionshipDto({ id: 'new' })]);

      expect(useChampionshipStore.getState().championships).toHaveLength(1);
      expect(useChampionshipStore.getState().championships[0]!.id).toBe('new');
    });
  });

  describe('setSelectedChampionship', () => {
    it('should set selected championship', () => {
      const detail = createChampionshipDetail({ id: 'detail-1' });

      useChampionshipStore.getState().setSelectedChampionship(detail);

      expect(useChampionshipStore.getState().selectedChampionship?.id).toBe('detail-1');
    });

    it('should reset related state when selecting championship', () => {
      // Set up related state
      useChampionshipStore.getState().setSelectedEventId('event-1');
      useChampionshipStore.getState().setParticipants([createParticipant()]);
      useChampionshipStore.getState().setFiringPointAssignments([createAssignment()]);

      // Select new championship
      useChampionshipStore.getState().setSelectedChampionship(createChampionshipDetail());

      // Related state should be reset
      expect(useChampionshipStore.getState().selectedEventId).toBeNull();
      expect(useChampionshipStore.getState().participants).toEqual([]);
      expect(useChampionshipStore.getState().firingPointAssignments).toEqual([]);
    });

    it('should preserve the selected event data when refreshing the same championship', () => {
      const event = {
        id: 'event-1',
        name: 'Qualification',
        eventType: 'BR60S',
        round: 'Qualification' as const,
        sortOrder: 0,
      };
      useChampionshipStore.getState().setSelectedChampionship(createChampionshipDetail({ events: [event] }));
      useChampionshipStore.getState().setSelectedEventId(event.id);
      useChampionshipStore.getState().setParticipants([createParticipant()]);
      useChampionshipStore.getState().setFiringPointAssignments([createAssignment()]);

      useChampionshipStore.getState().setSelectedChampionship(
        createChampionshipDetail({
          name: 'Updated Championship',
          events: [{ ...event, name: 'Updated Qualification' }],
        }),
      );

      const state = useChampionshipStore.getState();
      expect(state.selectedChampionship?.name).toBe('Updated Championship');
      expect(state.selectedEventId).toBe(event.id);
      expect(state.participants).toEqual([createParticipant()]);
      expect(state.firingPointAssignments).toEqual([createAssignment()]);
    });

    it('should clear selected event data when it no longer exists after refresh', () => {
      const event = {
        id: 'event-1',
        name: 'Qualification',
        eventType: 'BR60S',
        round: 'Qualification' as const,
        sortOrder: 0,
      };
      useChampionshipStore.getState().setSelectedChampionship(createChampionshipDetail({ events: [event] }));
      useChampionshipStore.getState().setSelectedEventId(event.id);
      useChampionshipStore.getState().setParticipants([createParticipant()]);
      useChampionshipStore.getState().setFiringPointAssignments([createAssignment()]);

      useChampionshipStore.getState().setSelectedChampionship(createChampionshipDetail({ events: [] }));

      const state = useChampionshipStore.getState();
      expect(state.selectedEventId).toBeNull();
      expect(state.participants).toEqual([]);
      expect(state.firingPointAssignments).toEqual([]);
    });

    it('should allow setting null', () => {
      useChampionshipStore.getState().setSelectedChampionship(createChampionshipDetail());
      useChampionshipStore.getState().setSelectedChampionship(null);

      expect(useChampionshipStore.getState().selectedChampionship).toBeNull();
    });
  });

  describe('setSelectedEventId', () => {
    it('should set selected event id', () => {
      useChampionshipStore.getState().setSelectedEventId('event-1');

      expect(useChampionshipStore.getState().selectedEventId).toBe('event-1');
    });

    it('should allow setting null', () => {
      useChampionshipStore.getState().setSelectedEventId('event-1');
      useChampionshipStore.getState().setSelectedEventId(null);

      expect(useChampionshipStore.getState().selectedEventId).toBeNull();
    });

    it('should clear data belonging to the previously selected event', () => {
      useChampionshipStore.getState().setSelectedEventId('event-1');
      useChampionshipStore.getState().setParticipants([createParticipant()]);
      useChampionshipStore.getState().setFiringPointAssignments([createAssignment()]);

      useChampionshipStore.getState().setSelectedEventId('event-2');

      expect(useChampionshipStore.getState().participants).toEqual([]);
      expect(useChampionshipStore.getState().firingPointAssignments).toEqual([]);
    });
  });

  describe('setParticipants', () => {
    it('should set participants list', () => {
      const participants = [createParticipant({ id: 'p1' }), createParticipant({ id: 'p2' })];

      useChampionshipStore.getState().setParticipants(participants);

      expect(useChampionshipStore.getState().participants).toHaveLength(2);
    });

    it('should replace existing participants', () => {
      useChampionshipStore.getState().setParticipants([createParticipant({ id: 'old' })]);
      useChampionshipStore.getState().setParticipants([createParticipant({ id: 'new' })]);

      expect(useChampionshipStore.getState().participants).toHaveLength(1);
      expect(useChampionshipStore.getState().participants[0]!.id).toBe('new');
    });
  });

  describe('setFiringPointAssignments', () => {
    it('should set firing point assignments', () => {
      const assignments = [createAssignment({ id: 'a1' }), createAssignment({ id: 'a2' })];

      useChampionshipStore.getState().setFiringPointAssignments(assignments);

      expect(useChampionshipStore.getState().firingPointAssignments).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      // Set up state
      useChampionshipStore.getState().setChampionships([createChampionshipDto()]);
      useChampionshipStore.getState().setSelectedChampionship(createChampionshipDetail());
      useChampionshipStore.getState().setSelectedEventId('event-1');
      useChampionshipStore.getState().setParticipants([createParticipant()]);
      useChampionshipStore.getState().setFiringPointAssignments([createAssignment()]);

      // Reset
      useChampionshipStore.getState().reset();

      const state = useChampionshipStore.getState();
      expect(state.championships).toEqual([]);
      expect(state.selectedChampionship).toBeNull();
      expect(state.selectedEventId).toBeNull();
      expect(state.participants).toEqual([]);
      expect(state.firingPointAssignments).toEqual([]);
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import {
  championshipModule,
  GetFiringPointAssignmentsByRelayToken,
} from '@/main/modules/championship/championship.module';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type {
  FiringPointAssignmentListResponse,
  ParticipantListResponse,
  SaveFiringPointAssignmentsPayload,
  SaveParticipantsPayload,
  UpdateEventPayload,
} from '@/shared/ipc/contracts/championship.contract';

interface ParticipantRow {
  id: string;
  event_id: string;
  player_name: string;
  affiliation: string;
  logo_path: string | null;
  sort_order: number;
}

interface EventRow {
  id: string;
  championship_id: string;
  name: string;
  event_type: string;
  round: string;
  sort_order: number;
}

interface FiringPointAssignmentRow {
  id: string;
  event_id: string;
  relay_number: number;
  firing_point_number: number;
  participant_id: string;
}

interface ChampionshipHandlers {
  saveParticipants(input: SaveParticipantsPayload): Promise<ParticipantListResponse>;
  saveFiringPointAssignments(input: SaveFiringPointAssignmentsPayload): Promise<FiringPointAssignmentListResponse>;
  updateEvent(input: UpdateEventPayload): Promise<void>;
}

function createHarness(
  initialRows: ParticipantRow[],
  options: {
    eventRow?: EventRow;
    hasStoredResults?: boolean;
    assignmentRows?: FiringPointAssignmentRow[];
  } = {},
) {
  const rows = initialRows.map((row) => ({ ...row }));
  const assignmentRows = (options.assignmentRows ?? []).map((row) => ({ ...row }));
  const eventRow = options.eventRow ? { ...options.eventRow } : null;
  const database = {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM participants WHERE event_id')) {
        return {
          all: (eventId: string) => rows.filter((row) => row.event_id === eventId),
        };
      }
      if (sql.includes('DELETE FROM participants WHERE id')) {
        return {
          run: (id: string) => {
            const index = rows.findIndex((row) => row.id === id);
            if (index >= 0) rows.splice(index, 1);
          },
        };
      }
      if (sql.includes('INSERT INTO participants')) {
        return {
          run: (params: {
            id: string;
            eventId: string;
            playerName: string;
            affiliation: string;
            logoPath: string | null;
            sortOrder: number;
          }) => {
            const nextRow: ParticipantRow = {
              id: params.id,
              event_id: params.eventId,
              player_name: params.playerName,
              affiliation: params.affiliation,
              logo_path: params.logoPath,
              sort_order: params.sortOrder,
            };
            const index = rows.findIndex((row) => row.id === params.id);
            if (index >= 0) rows[index] = nextRow;
            else rows.push(nextRow);
          },
        };
      }
      if (sql.includes('SELECT * FROM events WHERE id')) {
        return {
          get: (id: string) => (eventRow?.id === id ? eventRow : undefined),
        };
      }
      if (sql.includes('SELECT * FROM firing_point_assignments WHERE event_id = ? AND relay_number = ?')) {
        return {
          all: (eventId: string, relayNumber: number) =>
            assignmentRows.filter((row) => row.event_id === eventId && row.relay_number === relayNumber),
        };
      }
      if (sql.includes('EXISTS(SELECT 1 FROM results')) {
        return {
          get: () => ({ has_results: options.hasStoredResults ? 1 : 0 }),
        };
      }
      if (sql.includes('UPDATE events')) {
        return {
          run: (params: { id: string; name: string; eventType: string; round: string; sortOrder: number }) => {
            if (eventRow?.id !== params.id) return;
            eventRow.name = params.name;
            eventRow.event_type = params.eventType;
            eventRow.round = params.round;
            eventRow.sort_order = params.sortOrder;
          },
        };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    }),
    transaction: vi.fn(
      (work: (...args: unknown[]) => unknown) =>
        (...args: unknown[]) =>
          work(...args),
    ),
  } as unknown as Database.Database;

  let registeredHandlers: unknown;
  const ipcRouter = {
    register: vi.fn((_contract, handlers) => {
      registeredHandlers = handlers;
    }),
  } as unknown as IpcRouter;
  const queryHandlers = new Map<string, (input: unknown) => Promise<unknown>>();
  const queryBus = {
    register: vi.fn((token: { name: string }, handler: (input: unknown) => Promise<unknown>) => {
      queryHandlers.set(token.name, handler);
    }),
  } as unknown as QueryBus;
  const definitions = new Map([
    ['BR60S', { id: 'BR60S', config: { name: 'Qualification' } }],
    ['BP60', { id: 'BP60', config: { name: 'Qualification' } }],
    ['BR60S_FINAL', { id: 'BR60S_FINAL', config: { name: 'Final' } }],
  ]);
  const competitionTypeRegistry = {
    has: (id: string) => definitions.has(id),
    get: (id: string) => definitions.get(id),
    getAll: () => [...definitions.values()],
  } as unknown as CompetitionTypeRegistry;

  championshipModule.register({
    database,
    queryBus,
    ipcRouter,
    competitionTypeRegistry,
  });

  if (!registeredHandlers) throw new Error('Championship handlers were not registered');
  return { handlers: registeredHandlers as ChampionshipHandlers, rows, eventRow, queryHandlers };
}

const existingParticipant: ParticipantRow = {
  id: 'participant-1',
  event_id: 'event-1',
  player_name: 'Existing Athlete',
  affiliation: 'Test Team',
  logo_path: null,
  sort_order: 0,
};

const participantToDelete: ParticipantRow = {
  id: 'participant-2',
  event_id: 'event-1',
  player_name: 'Removed Athlete',
  affiliation: 'Test Team',
  logo_path: null,
  sort_order: 1,
};

const existingEvent: EventRow = {
  id: 'event-1',
  championship_id: 'championship-1',
  name: 'Qualification',
  event_type: 'BR60S',
  round: 'Qualification',
  sort_order: 0,
};

describe('championshipModule saveParticipants', () => {
  it('returns the persisted participant IDs in the command response', async () => {
    const { handlers } = createHarness([existingParticipant]);

    const response = await handlers.saveParticipants({
      eventId: 'event-1',
      participants: [
        {
          id: existingParticipant.id,
          playerName: 'Updated Athlete',
          affiliation: 'Updated Team',
        },
        {
          playerName: 'New Athlete',
          affiliation: 'New Team',
        },
      ],
    });

    expect(response.participants).toEqual([
      {
        id: existingParticipant.id,
        playerName: 'Updated Athlete',
        affiliation: 'Updated Team',
        logoPath: null,
        sortOrder: 0,
      },
      {
        id: expect.any(String),
        playerName: 'New Athlete',
        affiliation: 'New Team',
        logoPath: null,
        sortOrder: 1,
      },
    ]);
  });

  it('preserves an existing logo when an edit omits logoPath', async () => {
    const participantWithLogo = {
      ...existingParticipant,
      logo_path: '/logos/existing-athlete.png',
    };
    const { handlers, rows } = createHarness([participantWithLogo]);

    const response = await handlers.saveParticipants({
      eventId: 'event-1',
      participants: [
        {
          id: participantWithLogo.id,
          playerName: 'Renamed Athlete',
          affiliation: participantWithLogo.affiliation,
        },
      ],
    });

    expect(response.participants[0]?.logoPath).toBe(participantWithLogo.logo_path);
    expect(rows[0]?.logo_path).toBe(participantWithLogo.logo_path);
  });

  it('rejects an existing participant ID from another event', async () => {
    const { handlers, rows } = createHarness([existingParticipant]);

    await expect(
      handlers.saveParticipants({
        eventId: 'event-2',
        participants: [
          {
            id: existingParticipant.id,
            playerName: 'Moved Athlete',
            affiliation: 'Other Team',
          },
        ],
      }),
    ).rejects.toThrow(/does not belong to event/);

    expect(rows).toEqual([existingParticipant]);
  });

  it('rejects duplicate participant IDs in one save request', async () => {
    const { handlers, rows } = createHarness([existingParticipant]);

    await expect(
      handlers.saveParticipants({
        eventId: 'event-1',
        participants: [
          { id: existingParticipant.id, playerName: 'First Entry', affiliation: 'Test Team' },
          { id: existingParticipant.id, playerName: 'Second Entry', affiliation: 'Test Team' },
        ],
      }),
    ).rejects.toThrow(/duplicate participant ID/);

    expect(rows).toEqual([existingParticipant]);
  });

  it('rejects an omitted participant unless the deletion list matches exactly', async () => {
    const { handlers, rows } = createHarness([existingParticipant, participantToDelete]);

    await expect(
      handlers.saveParticipants({
        eventId: 'event-1',
        participants: [
          {
            id: existingParticipant.id,
            playerName: existingParticipant.player_name,
            affiliation: existingParticipant.affiliation,
          },
        ],
      }),
    ).rejects.toThrow(/deletion list does not match/);

    expect(rows).toEqual([existingParticipant, participantToDelete]);
  });

  it('deletes an omitted participant when the deletion list matches exactly', async () => {
    const { handlers, rows } = createHarness([existingParticipant, participantToDelete]);

    const response = await handlers.saveParticipants({
      eventId: 'event-1',
      participants: [
        {
          id: existingParticipant.id,
          playerName: existingParticipant.player_name,
          affiliation: existingParticipant.affiliation,
        },
      ],
      participantIdsToDelete: [participantToDelete.id],
    });

    expect(response.participants).toHaveLength(1);
    expect(rows).toEqual([existingParticipant]);
  });
});

describe('championshipModule updateEvent', () => {
  it('rejects a competition type change after results have been stored', async () => {
    const { handlers, eventRow } = createHarness([], {
      eventRow: existingEvent,
      hasStoredResults: true,
    });

    await expect(
      handlers.updateEvent({
        id: existingEvent.id,
        name: 'Changed event',
        eventType: 'BR60S_FINAL',
      }),
    ).rejects.toThrow(/Cannot change the type of an event with saved results/);

    expect(eventRow).toEqual(existingEvent);
  });

  it('still permits a name change when results have been stored', async () => {
    const { handlers, eventRow } = createHarness([], {
      eventRow: existingEvent,
      hasStoredResults: true,
    });

    await handlers.updateEvent({
      id: existingEvent.id,
      name: 'Renamed qualification',
      eventType: existingEvent.event_type,
    });

    expect(eventRow).toMatchObject({
      name: 'Renamed qualification',
      event_type: existingEvent.event_type,
      round: existingEvent.round,
    });
  });
});

describe('championshipModule relay assignment query', () => {
  it('returns canonical participant identity with each firing-point assignment', async () => {
    const { queryHandlers } = createHarness([existingParticipant], {
      assignmentRows: [
        {
          id: 'assignment-1',
          event_id: 'event-1',
          relay_number: 2,
          firing_point_number: 3,
          participant_id: existingParticipant.id,
        },
      ],
    });
    const handler = queryHandlers.get(GetFiringPointAssignmentsByRelayToken.name);

    await expect(handler?.({ eventId: 'event-1', relayNumber: 2 })).resolves.toEqual([
      {
        firingPointNumber: 3,
        participantId: existingParticipant.id,
        playerName: existingParticipant.player_name,
        affiliation: existingParticipant.affiliation,
      },
    ]);
  });
});

describe('championshipModule saveFiringPointAssignments', () => {
  it('rejects assigning one participant to multiple relays', async () => {
    const { handlers } = createHarness([]);

    await expect(
      handlers.saveFiringPointAssignments({
        eventId: 'event-1',
        assignments: [
          { relayNumber: 1, firingPointNumber: 1, participantId: 'participant-1' },
          { relayNumber: 2, firingPointNumber: 1, participantId: 'participant-1' },
        ],
      }),
    ).rejects.toThrow(/Participant participant-1 is assigned more than once/);
  });

  it('rejects assigning one firing point more than once', async () => {
    const { handlers } = createHarness([]);

    await expect(
      handlers.saveFiringPointAssignments({
        eventId: 'event-1',
        assignments: [
          { relayNumber: 1, firingPointNumber: 1, participantId: 'participant-1' },
          { relayNumber: 1, firingPointNumber: 1, participantId: 'participant-2' },
        ],
      }),
    ).rejects.toThrow(/Relay 1 firing point 1 is assigned more than once/);
  });
});

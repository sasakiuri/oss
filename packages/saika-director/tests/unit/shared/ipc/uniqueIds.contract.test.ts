import { describe, expect, it } from 'vitest';
import { laneControlContract, resultsContract } from '@/shared/ipc/contracts';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const LANE_ID = '22222222-2222-4222-8222-222222222222';
const RESULT_ID = '33333333-3333-4333-8333-333333333333';

describe('unique IPC identifiers', () => {
  it('rejects duplicate Lane IDs in batch Lane commands', () => {
    const result = laneControlContract.procedures.startPreparation.input.safeParse({
      laneIds: [LANE_ID, LANE_ID],
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate channels and participants in Lane assignments', () => {
    const duplicateChannels = laneControlContract.procedures.assignPlayers.input.safeParse({
      eventType: 'BR60S',
      assignments: [
        { channel: 1, playerName: 'Player A', affiliation: 'Club A', participantId: 'participant-a' },
        { channel: 1, playerName: 'Player B', affiliation: 'Club B', participantId: 'participant-b' },
      ],
    });
    const duplicateParticipants = laneControlContract.procedures.assignPlayers.input.safeParse({
      eventType: 'BR60S',
      assignments: [
        { channel: 1, playerName: 'Player A', affiliation: 'Club A', participantId: 'participant-a' },
        { channel: 2, playerName: 'Player A', affiliation: 'Club A', participantId: 'participant-a' },
      ],
    });

    expect(duplicateChannels.success).toBe(false);
    expect(duplicateParticipants.success).toBe(false);
  });

  it('rejects duplicate result IDs when confirming results', () => {
    const result = resultsContract.procedures.confirm.input.safeParse({
      eventId: EVENT_ID,
      resultIds: [RESULT_ID, RESULT_ID],
    });

    expect(result.success).toBe(false);
  });
});

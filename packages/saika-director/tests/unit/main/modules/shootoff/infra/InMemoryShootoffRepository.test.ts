import { describe, expect, it } from 'vitest';
import { InMemoryShootoffRepository } from '@/main/modules/shootoff/infra/InMemoryShootoffRepository';
import { FinalShootoff } from '@/main/modules/shootoff/domain/FinalShootoff';
import { ParticipantId } from '@/main/modules/championship';
import { Score } from '@/main/modules/lane-control';

describe('InMemoryShootoffRepository', () => {
  it('indexes a newly saved shoot-off by event and preserves the index on updates', () => {
    const repository = new InMemoryShootoffRepository();
    const participant1 = ParticipantId.create('participant-1');
    const participant2 = ParticipantId.create('participant-2');
    const shootoff = FinalShootoff.create([participant1, participant2], 3);

    repository.saveWithEventId(shootoff, 'event-1');

    expect(repository.findByEventId('event-1')).toEqual([shootoff]);
    expect(repository.findActiveByEventId('event-1')).toBe(shootoff);

    const resolved = shootoff
      .addRound([
        { participantId: participant1, roundNumber: 1, score: Score.create(10.5) },
        { participantId: participant2, roundNumber: 1, score: Score.create(10.0) },
      ])
      .resolveRanks();
    repository.save(resolved);

    expect(repository.findByEventId('event-1')).toEqual([resolved]);
    expect(repository.findActiveByEventId('event-1')).toBeUndefined();
  });
});

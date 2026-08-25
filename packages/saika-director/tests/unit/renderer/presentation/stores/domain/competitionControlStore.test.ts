import { beforeEach, describe, expect, it } from 'vitest';

import { useCompetitionControlStore } from '@/renderer/presentation/stores/domain/competitionControl.store';

describe('useCompetitionControlStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useCompetitionControlStore.getState().reset();
  });

  it('keeps result context keyed by competition until explicitly cleared', () => {
    useCompetitionControlStore.getState().setResultContext('competition-1', {
      eventId: 'event-1',
      relayNumber: 2,
    });

    expect(useCompetitionControlStore.getState().getResultContext('competition-1')).toEqual({
      eventId: 'event-1',
      relayNumber: 2,
    });

    useCompetitionControlStore.getState().clearResultContext('competition-1');
    expect(useCompetitionControlStore.getState().getResultContext('competition-1')).toBeNull();
  });

  it('does not overwrite another competition result context', () => {
    useCompetitionControlStore.getState().setResultContext('competition-1', {
      eventId: 'event-1',
      relayNumber: 1,
    });
    useCompetitionControlStore.getState().setResultContext('competition-2', {
      eventId: 'event-2',
      relayNumber: 2,
    });

    expect(useCompetitionControlStore.getState().getResultContext('competition-1')?.eventId).toBe('event-1');
    expect(useCompetitionControlStore.getState().getResultContext('competition-2')?.eventId).toBe('event-2');
  });

  it('restores result context after the renderer store is rehydrated', async () => {
    localStorage.setItem(
      'saika-director-competition-control',
      JSON.stringify({
        state: {
          resultContexts: {
            'competition-1': { eventId: 'event-1', relayNumber: 3 },
          },
        },
        version: 0,
      }),
    );

    await useCompetitionControlStore.persist.rehydrate();

    expect(useCompetitionControlStore.getState().getResultContext('competition-1')).toEqual({
      eventId: 'event-1',
      relayNumber: 3,
    });
  });
});

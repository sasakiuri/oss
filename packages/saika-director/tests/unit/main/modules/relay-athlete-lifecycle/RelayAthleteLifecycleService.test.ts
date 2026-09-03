import { describe, expect, it } from 'vitest';

import {
  IssfRelayAthleteLifecyclePolicy,
  RelayAthleteLifecycleEntry,
  RelayAthleteLifecycleService,
} from '@/main/modules/relay-athlete-lifecycle';
import type {
  IRelayAthleteLifecycleRepository,
  RelayAthleteLifecycleScope,
} from '@/main/modules/relay-athlete-lifecycle/domain/IRelayAthleteLifecycleRepository';

const base = {
  competitionId: 'competition-a',
  relayNumber: 1,
  laneId: 'lane-a',
  athleteId: 'athlete-a',
  athleteName: 'Athlete A',
  athleteStartNumber: 12,
  source: 'MANUAL' as const,
  statement: 'Checked',
  officialName: 'RO A',
};

describe('RelayAthleteLifecycleService', () => {
  it('enforces post-relay prerequisites only when the replaceable policy is REQUIRED', async () => {
    const repository = new MemoryRepository();
    const service = new RelayAthleteLifecycleService(repository, new IssfRelayAthleteLifecyclePolicy('REQUIRED'));
    const release = {
      ...base,
      phase: 'POST_RELAY' as const,
      requirement: 'ATHLETE_RELEASED' as const,
      state: 'CONFIRMED' as const,
    };

    await expect(service.record(release)).rejects.toThrow('firearm clearance');
    for (const requirement of ['FIREARM_UNLOADED_SAFETY_FLAG_VERIFIED', 'PRINTOUT_ATHLETE_SIGNED'] as const) {
      await service.record({ ...release, requirement });
    }
    await expect(service.record(release)).resolves.toMatchObject({ requirement: 'ATHLETE_RELEASED' });
  });
});

class MemoryRepository implements IRelayAthleteLifecycleRepository {
  private readonly entries: RelayAthleteLifecycleEntry[] = [];

  append(entry: RelayAthleteLifecycleEntry): void {
    this.entries.push(entry);
  }

  findByScope(scope: RelayAthleteLifecycleScope): RelayAthleteLifecycleEntry[] {
    return this.entries.filter(
      (entry) =>
        entry.competitionId === scope.competitionId &&
        entry.relayNumber === scope.relayNumber &&
        entry.phase === scope.phase,
    );
  }

  findByRelay(scope: Omit<RelayAthleteLifecycleScope, 'phase'>): RelayAthleteLifecycleEntry[] {
    return this.entries.filter(
      (entry) => entry.competitionId === scope.competitionId && entry.relayNumber === scope.relayNumber,
    );
  }
}

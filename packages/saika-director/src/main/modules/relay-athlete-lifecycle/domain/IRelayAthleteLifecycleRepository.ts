import type { RelayAthleteLifecycleEntry, RelayAthleteLifecyclePhase } from './RelayAthleteLifecycleEntry';

export interface RelayAthleteLifecycleScope {
  competitionId: string;
  relayNumber: number;
  phase: RelayAthleteLifecyclePhase;
}

export interface IRelayAthleteLifecycleRepository {
  append(entry: RelayAthleteLifecycleEntry): void;
  findByScope(scope: RelayAthleteLifecycleScope): RelayAthleteLifecycleEntry[];
  findByRelay(scope: Omit<RelayAthleteLifecycleScope, 'phase'>): RelayAthleteLifecycleEntry[];
}

import type { RelayReadinessEntry, RelayReadinessPhase } from './RelayReadinessEntry';

export interface RelayReadinessScope {
  competitionId: string;
  relayNumber: number;
  phase: RelayReadinessPhase;
}

export interface IRelayReadinessRepository {
  append(entry: RelayReadinessEntry): void;
  findByScope(scope: RelayReadinessScope): RelayReadinessEntry[];
  findByRelay(scope: Omit<RelayReadinessScope, 'phase'>): RelayReadinessEntry[];
}

import type { RelayReadinessMode } from './RelayReadinessPolicy';

export interface RelayStartSettings {
  readonly competitionId: string;
  readonly relayNumber: number;
  readonly mode: RelayReadinessMode;
}
export interface IRelayStartSettingsRepository {
  find(competitionId: string): RelayStartSettings | null;
  save(settings: RelayStartSettings): void;
}

import type { EquipmentControlEntry, PostCompetitionEquipmentCheck } from './PostCompetitionEquipmentCheck';

export interface IPostCompetitionEquipmentCheckRepository {
  appendChecks(checks: readonly PostCompetitionEquipmentCheck[]): void;
  appendEntry(entry: EquipmentControlEntry): void;
  findById(checkId: string): PostCompetitionEquipmentCheck | null;
  findByChampionship(championshipId: string): PostCompetitionEquipmentCheck[];
  findEntries(checkId: string): EquipmentControlEntry[];
}

import type { LaneInterruptionRecord } from './LaneInterruptionRecord';

export interface ICompetitionInterruptionRepository {
  findByCompetitionId(competitionId: string): LaneInterruptionRecord | null;
  save(record: LaneInterruptionRecord): void;
  delete(competitionId: string): void;
}

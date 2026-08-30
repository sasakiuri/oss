export type ProductionOperationAction =
  | 'MUSIC_PROGRAM_APPROVED'
  | 'MUSIC_PROGRAM_APPROVAL_REVOKED'
  | 'MUSIC_STARTED'
  | 'MUSIC_STOPPED'
  | 'FINAL_PRODUCTION_CONFIRMED'
  | 'FINAL_PRODUCTION_REVOKED'
  | 'ANNOUNCEMENT_NOTE';

export interface ProductionOperationEntry {
  id: string;
  competitionId: string;
  competitionTypeId: string;
  roundName: string;
  phase: string;
  action: ProductionOperationAction;
  statement: string;
  officialName: string;
  recordedAt: string;
}

export interface IProductionOperationRepository {
  append(entry: ProductionOperationEntry): void;
  findByCompetition(competitionId: string): ProductionOperationEntry[];
}

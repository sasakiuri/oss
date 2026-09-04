import type { EstComplaintSignalSnapshot } from './IEstComplaintSignalSource';

export interface EstComplaintCaseLink {
  readonly signalId: string;
  readonly targetExaminationCaseId: string;
  readonly snapshot: EstComplaintSignalSnapshot;
  readonly snapshotSha256: string;
  readonly linkedBy: string;
  readonly linkedAt: Date;
}

export interface IEstComplaintCaseLinkRepository {
  executeInTransaction<T>(operation: () => T): T;
  append(link: EstComplaintCaseLink): void;
  findBySignalId(signalId: string): EstComplaintCaseLink | null;
  findByCompetitionId(competitionId: string): EstComplaintCaseLink[];
}

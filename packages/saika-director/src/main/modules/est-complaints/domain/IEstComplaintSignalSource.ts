import type { EstComplaintIssue, EstComplaintSignalPayload } from '@/shared/mqtt';

export interface EstComplaintSignalSnapshot {
  readonly signalId: string;
  readonly laneId: string;
  readonly firingPointNumber: number | null;
  readonly status: 'ACTIVE' | 'CLEARED';
  readonly issue: EstComplaintIssue;
  readonly context: NonNullable<EstComplaintSignalPayload['context']>;
  readonly message: string | null;
  readonly signalledAt: Date;
}

/** Read-only boundary for independently received Lane complaint observations. */
export interface IEstComplaintSignalSource {
  findById(signalId: string): EstComplaintSignalSnapshot | null;
  listByCompetition(competitionId: string): EstComplaintSignalSnapshot[];
}

export interface QualificationMalfunctionSignalSnapshot {
  readonly signalId: string;
  readonly laneId: string;
  readonly status: 'ACTIVE' | 'CLEARED';
  readonly competitionId: string;
  readonly sessionId: string;
  readonly participantId: string;
  readonly participantName: string;
  readonly startNumber: string | null;
  readonly phase: 'SIGHTING' | 'MATCH';
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly seriesShotLimit: number | null;
  readonly recordedShots: number;
  readonly timedTargetProgramId: string | null;
  readonly exposureIndex: number | null;
  readonly message: string | null;
  readonly signalledAt: Date;
}

/** Read-only boundary for independently received Lane declarations. */
export interface IQualificationMalfunctionSignalSource {
  findById(signalId: string): QualificationMalfunctionSignalSnapshot | null;
}

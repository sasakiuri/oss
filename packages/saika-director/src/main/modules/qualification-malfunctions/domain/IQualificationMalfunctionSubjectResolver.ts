import type { QualificationMalfunctionReportSource } from './QualificationMalfunctionCase';

export interface QualificationMalfunctionSubjectSnapshot {
  readonly participantName: string;
  readonly startNumber: string | null;
  readonly laneSnapshotCapturedAt: Date | null;
}

export interface IQualificationMalfunctionSubjectResolver {
  resolve(input: {
    eventId: string;
    participantId: string;
    laneId: string;
    laneChannel: number;
    relayNumber: number;
    stageIndex: number;
    seriesIndex: number;
    recordedShots: number;
    reportSource: QualificationMalfunctionReportSource;
  }): QualificationMalfunctionSubjectSnapshot;
}

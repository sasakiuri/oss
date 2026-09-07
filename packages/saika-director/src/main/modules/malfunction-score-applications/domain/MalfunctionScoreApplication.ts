import type { QualificationScoreOverlay } from '@/main/modules/results';
import type { QualificationMalfunctionCase, MalfunctionScoreSheet } from '@/main/modules/qualification-malfunctions';

export interface MalfunctionScoreApplicationRequest {
  readonly sheetId: string;
  readonly innerTens: readonly boolean[];
  readonly officialName: string;
  readonly officialRole: 'RTS_OFFICER' | 'JURY_MEMBER';
  readonly statement: string;
}
export interface MalfunctionScoreApplicationPreview {
  readonly request: MalfunctionScoreApplicationRequest;
  readonly caseId: string;
  readonly eventId: string;
  readonly participantId: string;
  readonly relayNumber: number;
  readonly resultId: string;
  readonly sourceDigest: string;
  readonly seriesIndex: number;
  readonly originalScoresX10: readonly number[];
  readonly sheetDigest: string;
  readonly replacement: Omit<QualificationScoreOverlay, 'id' | 'issues'>;
  readonly digest: string;
}
export interface MalfunctionScoreApplication extends MalfunctionScoreApplicationPreview {
  readonly id: string;
  readonly recordedAt: string;
}
export interface MalfunctionScoreWithdrawal {
  readonly id: string;
  readonly applicationId: string;
  readonly officialName: string;
  readonly officialRole: 'RTS_OFFICER' | 'JURY_MEMBER';
  readonly statement: string;
  readonly recordedAt: string;
}
export interface IMalfunctionScoreApplicationRepository {
  find(id: string): MalfunctionScoreApplication | null;
  list(caseId: string): readonly MalfunctionScoreApplication[];
  byTarget(eventId: string, participantId: string, relayNumber: number): readonly MalfunctionScoreApplication[];
  append(value: MalfunctionScoreApplication): void;
  withdrawal(applicationId: string): MalfunctionScoreWithdrawal | null;
  withdraw(value: MalfunctionScoreWithdrawal): void;
}
/** Snapshot acquisition is independent of the calculation and its official application. */
export interface IMalfunctionScoreApplicationTargetSource {
  resolve(
    value: QualificationMalfunctionCase,
    sheet: MalfunctionScoreSheet,
  ): {
    readonly resultId: string;
    readonly sourceDigest: string;
    readonly seriesIndex: number;
    readonly originalScoresX10: readonly number[];
  };
}

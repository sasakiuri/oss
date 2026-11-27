import type { ResultScope } from '@/main/domain/resultScope';
import type { IrregularShotCase, IrregularShotCaseEntry, IrregularShotEvidence } from './IrregularShotCase';

export interface IIrregularShotCaseRepository {
  appendCase(value: IrregularShotCase): void;
  appendEvidence(value: IrregularShotEvidence): void;
  appendEntry(value: IrregularShotCaseEntry): void;
  findCaseById(id: string): IrregularShotCase | null;
  findCasesByEvent(eventId: string, resultScope?: ResultScope): IrregularShotCase[];
  findEntries(caseIds: readonly string[]): Map<string, IrregularShotCaseEntry[]>;
  findEvidence(caseIds: readonly string[]): Map<string, IrregularShotEvidence[]>;
}

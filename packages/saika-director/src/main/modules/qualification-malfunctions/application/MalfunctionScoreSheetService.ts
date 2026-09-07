import { createHash } from 'node:crypto';

import type { IQualificationMalfunctionRepository } from '../domain/IQualificationMalfunctionRepository';
import { QualificationMalfunctionEntry, qualificationMalfunctionStatus } from '../domain/QualificationMalfunctionCase';
import {
  calculateMalfunctionScoreSheet,
  type MalfunctionScoreSheet,
  type MalfunctionScoreSheetInput,
} from '../domain/MalfunctionScoreSheet';
import type { IMalfunctionScoreSheetExporter, IMalfunctionScoreSheetRepository } from './MalfunctionScoreSheetPorts';

export class MalfunctionScoreSheetService {
  constructor(
    private readonly cases: IQualificationMalfunctionRepository,
    private readonly sheets: IMalfunctionScoreSheetRepository,
    private readonly exporter: IMalfunctionScoreSheetExporter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  preview(input: MalfunctionScoreSheetInput): Omit<MalfunctionScoreSheet, 'id' | 'version' | 'recordedAt'> {
    const value = this.cases.findCaseById(input.caseId);
    if (!value) throw new Error('Malfunction case not found');
    const entries = this.cases.findEntries([value.id]).get(value.id) ?? [];
    const calculation = calculateMalfunctionScoreSheet(value, entries, input);
    const context: MalfunctionScoreSheet['context'] = {
      competitionId: value.competitionId,
      eventId: value.eventId,
      participantId: value.participantId,
      athleteName: value.participantNameSnapshot,
      startNumber: value.startNumberSnapshot,
      laneId: value.laneId,
      laneChannel: value.laneChannelSnapshot,
      stageIndex: value.stageIndex,
      seriesIndex: value.seriesIndex,
      rulePackIdentity: value.rulePackIdentity,
    };
    const content = { input: structuredClone(input), calculation, context };
    return { ...content, digest: digest(content) };
  }

  save(input: MalfunctionScoreSheetInput, id: string, expectedDigest: string): MalfunctionScoreSheet {
    return this.cases.executeInTransaction(() => {
      const existing = this.sheets.find(id);
      if (existing) {
        if (existing.digest !== expectedDigest || digest(existing.input) !== digest(input)) {
          throw new Error('This score-sheet ID is already bound to different evidence');
        }
        return existing;
      }
      const preview = this.preview(input);
      if (preview.digest !== expectedDigest) throw new Error('Score evidence changed; preview and confirm it again');
      const entries = this.cases.findEntries([input.caseId]).get(input.caseId) ?? [];
      if (qualificationMalfunctionStatus(entries) !== 'EXECUTED') {
        throw new Error(
          'Create score sheets before settlement; settled cases require the official correction workflow',
        );
      }
      const sheet: MalfunctionScoreSheet = {
        ...preview,
        id,
        version: this.sheets.list(input.caseId).length + 1,
        recordedAt: this.now().toISOString(),
      };
      this.sheets.append(sheet);
      this.cases.appendEntry(
        QualificationMalfunctionEntry.create({
          caseId: input.caseId,
          type: 'NOTE',
          artifactId: sheet.id,
          statement: `Confirmed ${sheet.calculation.form} calculation v${sheet.version}: ${sheet.calculation.totalX10 / 10}. ${input.statement}`,
          officialName: input.officialName,
          officialRole: input.officialRole,
          ruleReference: sheet.calculation.ruleReference,
          recordedAt: new Date(sheet.recordedAt),
        }),
      );
      return sheet;
    });
  }

  list(caseId: string): MalfunctionScoreSheet[] {
    return this.sheets.list(caseId);
  }

  async export(id: string) {
    const sheet = this.sheets.find(id);
    if (!sheet) throw new Error('Malfunction score sheet not found');
    const { input, calculation, context } = sheet;
    if (digest({ input, calculation, context }) !== sheet.digest) throw new Error('Stored score-sheet digest mismatch');
    return this.exporter.export(sheet);
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

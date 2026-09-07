import { createHash } from 'node:crypto';
import {
  calculateMalfunctionScoreSheet,
  QualificationMalfunctionEntry,
  qualificationMalfunctionStatus,
  type IQualificationMalfunctionRepository,
  type IMalfunctionScoreSheetRepository,
} from '@/main/modules/qualification-malfunctions';
import type {
  IMalfunctionScoreApplicationRepository,
  IMalfunctionScoreApplicationTargetSource,
  MalfunctionScoreApplication,
  MalfunctionScoreApplicationPreview,
  MalfunctionScoreApplicationRequest,
  MalfunctionScoreWithdrawal,
} from '../domain/MalfunctionScoreApplication';

export class MalfunctionScoreApplicationService {
  constructor(
    private readonly cases: IQualificationMalfunctionRepository,
    private readonly sheets: IMalfunctionScoreSheetRepository,
    private readonly applications: IMalfunctionScoreApplicationRepository,
    private readonly targets: IMalfunctionScoreApplicationTargetSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(caseId: string) {
    return this.applications.list(caseId).map((application) => ({
      application,
      withdrawal: this.applications.withdrawal(application.id),
    }));
  }

  preview(request: MalfunctionScoreApplicationRequest): MalfunctionScoreApplicationPreview {
    assertOfficial(request);
    const sheet = this.sheets.find(request.sheetId);
    if (!sheet) throw new Error('Confirmed calculation not found');
    const value = this.cases.findCaseById(sheet.input.caseId);
    if (!value) throw new Error('Malfunction case not found');
    const entries = this.cases.findEntries([value.id]).get(value.id) ?? [];
    if (qualificationMalfunctionStatus(entries) !== 'EXECUTED')
      throw new Error('Score application requires an executed case with unsettled scoring');
    if (this.sheets.list(value.id).at(-1)?.id !== sheet.id) throw new Error('Use the latest confirmed calculation');
    if (
      hash({ input: sheet.input, calculation: sheet.calculation, context: sheet.context }) !== sheet.digest ||
      hash(calculateMalfunctionScoreSheet(value, entries, sheet.input)) !== hash(sheet.calculation)
    )
      throw new Error('The confirmed calculation no longer matches the case evidence');
    const target = this.targets.resolve(value, sheet);
    if (
      this.applications
        .byTarget(value.eventId, value.participantId, value.relayNumberSnapshot)
        .some((item) => item.seriesIndex === target.seriesIndex && !this.applications.withdrawal(item.id))
    )
      throw new Error('Withdraw the existing application for this series before applying another calculation');
    const counted = sheet.calculation.countedShots;
    if (counted.length !== 5 || request.innerTens.length !== 5 || request.innerTens.some((v) => typeof v !== 'boolean'))
      throw new Error('Confirm inner-ten status for all five counted positions');
    if (request.innerTens.some((inner, index) => inner && counted[index]!.scoreX10 !== 100))
      throw new Error('Only a counted ten may be classified as an inner ten');
    const replacement = {
      sourceDigest: target.sourceDigest,
      seriesIndex: target.seriesIndex,
      shotsX10: counted.map((shot) => shot.scoreX10),
      rankingShots: counted.map((shot, index) => ({
        shotId: shot.shotId,
        ringScore: shot.scoreX10 / 10,
        decimalScore: null,
        innerTen: request.innerTens[index]!,
        seriesIndex: target.seriesIndex,
      })),
      publicRemark: `${sheet.calculation.form} calculation v${sheet.version}, ${sheet.calculation.ruleReference}: ${request.statement.trim()}`,
    };
    const content = {
      request: structuredClone(request),
      caseId: value.id,
      eventId: value.eventId,
      participantId: value.participantId,
      relayNumber: value.relayNumberSnapshot,
      ...target,
      sheetDigest: sheet.digest,
      replacement,
    };
    return { ...content, digest: hash(content) };
  }

  apply(input: {
    id: string;
    request: MalfunctionScoreApplicationRequest;
    expectedDigest: string;
    confirmed: true;
  }): MalfunctionScoreApplication {
    if (input.confirmed !== true) throw new Error('Explicit score-application confirmation is required');
    return this.cases.executeInTransaction(() => {
      const previous = this.applications.find(input.id);
      if (previous) {
        if (previous.digest !== input.expectedDigest || hash(previous.request) !== hash(input.request))
          throw new Error('This application ID is already bound to different evidence');
        return previous;
      }
      const preview = this.preview(input.request);
      if (preview.digest !== input.expectedDigest)
        throw new Error('The score or calculation changed; preview it again');
      const application = { ...preview, id: input.id, recordedAt: this.now().toISOString() };
      this.applications.append(application);
      this.cases.appendEntry(
        QualificationMalfunctionEntry.create({
          caseId: preview.caseId,
          type: 'SCORE_SETTLED',
          artifactId: application.id,
          officialName: input.request.officialName,
          officialRole: input.request.officialRole,
          statement: `Applied calculation ${input.request.sheetId} to Director result ${preview.resultId}. ${input.request.statement}`,
          recordedAt: new Date(application.recordedAt),
        }),
      );
      return application;
    });
  }

  withdraw(input: Omit<MalfunctionScoreWithdrawal, 'recordedAt'>): MalfunctionScoreWithdrawal {
    assertOfficial(input);
    return this.cases.executeInTransaction(() => {
      const application = this.applications.find(input.applicationId);
      if (!application) throw new Error('Score application not found');
      const previous = this.applications.withdrawal(application.id);
      if (previous) {
        const { recordedAt: _time, ...saved } = previous;
        if (hash(saved) !== hash(input)) throw new Error('The score application has already been withdrawn');
        return previous;
      }
      const withdrawal = { ...input, recordedAt: this.now().toISOString() };
      this.applications.withdraw(withdrawal);
      const entries = this.cases.findEntries([application.caseId]).get(application.caseId) ?? [];
      const status = qualificationMalfunctionStatus(entries);
      this.cases.appendEntry(
        QualificationMalfunctionEntry.create({
          caseId: application.caseId,
          type: status === 'SETTLED' || status === 'COMPLETED' ? 'SCORE_REOPENED' : 'NOTE',
          artifactId: withdrawal.id,
          officialName: input.officialName,
          officialRole: input.officialRole,
          statement: `Withdrew score application ${application.id}. ${input.statement}`,
          recordedAt: new Date(withdrawal.recordedAt),
        }),
      );
      return withdrawal;
    });
  }
}
function assertOfficial(input: { officialName: string; officialRole: string; statement: string }) {
  if (
    !['RTS_OFFICER', 'JURY_MEMBER'].includes(input.officialRole) ||
    !input.officialName.trim() ||
    !input.statement.trim()
  )
    throw new Error('RTS or Jury identity and a confirmation statement are required');
}
export function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

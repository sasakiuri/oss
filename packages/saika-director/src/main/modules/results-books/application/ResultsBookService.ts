import { createHash } from 'node:crypto';
import { basename } from 'node:path';

import type { ArchiveFileGateway } from '@/main/modules/operational-archives';
import type { ResultsBookWorkspaceDto } from '@/shared/ipc/contracts';

import type { IResultsBookDocumentExporter, ResultsBookDocumentFormat } from './IResultsBookDocumentExporter';
import type { IResultsBookRepository } from '../domain/IResultsBookRepository';
import type {
  ChampionshipOfficialEntry,
  IResultsBookSource,
  RecordClaim,
  RecordClaimEntry,
  ResultsBookVersion,
} from '../domain/ResultsBookModels';
import {
  assertRecordCode,
  assertRecordTransition,
  recordClaimStatus,
  requiredResultsBookSigners,
  type ChampionshipOfficialRole,
  type RecordCode,
  type RecordResultBasis,
} from '../domain/ResultsBookPolicy';

export class ResultsBookService {
  constructor(
    private readonly repository: IResultsBookRepository,
    private readonly source: IResultsBookSource,
    private readonly files: ArchiveFileGateway,
    private readonly now: () => Date = () => new Date(),
    private readonly documentExporter?: IResultsBookDocumentExporter,
  ) {}

  async getWorkspace(championshipId: string): Promise<ResultsBookWorkspaceDto> {
    const officialEntries = this.repository.findOfficialEntries(championshipId);
    const officials = activeOfficials(officialEntries);
    const claims = this.repository.findRecordClaims(championshipId);
    const claimEntries = this.repository.findRecordClaimEntries(claims.map((claim) => claim.id));
    const books = this.repository.findBooks(championshipId);
    return {
      officials: officials.map((entry) => ({
        appointmentId: entry.id,
        role: entry.role,
        officialName: entry.officialName,
        organization: entry.organization,
        appointedAt: entry.recordedAt.toISOString(),
      })),
      eligibleRecordResults: (await this.source.eligibleRecordResults(championshipId)).map(toEligibleResultDto),
      recordClaims: claims.map((claim) => toClaimDto(claim, claimEntries.get(claim.id) ?? [])),
      books: books.map((book) => this.toBookDto(book)),
    };
  }

  async appointOfficial(input: {
    championshipId: string;
    role: ChampionshipOfficialRole;
    officialName: string;
    organization?: string;
    statement: string;
    recordedBy: string;
  }): Promise<ResultsBookWorkspaceDto> {
    const active = activeOfficials(this.repository.findOfficialEntries(input.championshipId));
    if (active.some((entry) => entry.role === input.role && entry.officialName === input.officialName.trim())) {
      throw new Error('This official already has an active appointment in that role');
    }
    this.repository.appendOfficialEntry({
      id: crypto.randomUUID(),
      championshipId: input.championshipId,
      operation: 'APPOINT',
      role: input.role,
      officialName: required(input.officialName, 'officialName'),
      organization: optional(input.organization),
      statement: required(input.statement, 'statement'),
      recordedBy: required(input.recordedBy, 'recordedBy'),
      recordedAt: this.now(),
      reversesEntryId: null,
    });
    return this.getWorkspace(input.championshipId);
  }

  async revokeOfficial(input: {
    championshipId: string;
    appointmentId: string;
    statement: string;
    recordedBy: string;
  }): Promise<ResultsBookWorkspaceDto> {
    const entries = this.repository.findOfficialEntries(input.championshipId);
    const appointment = activeOfficials(entries).find((entry) => entry.id === input.appointmentId);
    if (!appointment) throw new Error('The selected official appointment is not active');
    this.repository.appendOfficialEntry({
      ...appointment,
      id: crypto.randomUUID(),
      operation: 'REVOKE',
      statement: required(input.statement, 'statement'),
      recordedBy: required(input.recordedBy, 'recordedBy'),
      recordedAt: this.now(),
      reversesEntryId: appointment.id,
    });
    return this.getWorkspace(input.championshipId);
  }

  async createRecordClaim(input: {
    championshipId: string;
    resultId: string;
    resultScope: 'QUALIFICATION' | 'FINAL';
    code: RecordCode;
    resultBasis: RecordResultBasis;
    benchmarkScoreX10: number;
    olympicGamesConfirmed: boolean;
    claimedBy: string;
    achievedAt: string;
  }): Promise<ResultsBookWorkspaceDto> {
    const source = (await this.source.eligibleRecordResults(input.championshipId)).find(
      (result) => result.resultId === input.resultId && result.resultScope === input.resultScope,
    );
    if (!source) throw new Error('The selected result is not an officially published result for this championship');
    if (source.entryStatus !== 'COMPETING') {
      throw new Error(`${source.entryStatus} entries cannot establish ISSF records`);
    }
    if (source.subjectKind === 'TEAM' && source.members?.length !== 3) {
      throw new Error('A three-member Team record source must preserve all three member results');
    }
    assertRecordCode({
      code: input.code,
      resultScope: input.resultScope,
      resultBasis: input.resultBasis,
      scoreX10: source.scoreX10,
      benchmarkScoreX10: input.benchmarkScoreX10,
      olympicGamesConfirmed: input.olympicGamesConfirmed,
    });
    const existingClaims = this.repository.findRecordClaims(input.championshipId);
    const existingEntries = this.repository.findRecordClaimEntries(existingClaims.map((claim) => claim.id));
    const duplicate = existingClaims.find(
      (claim) =>
        claim.source.resultId === source.resultId &&
        claim.source.resultScope === source.resultScope &&
        claim.source.snapshotRevision === source.snapshotRevision &&
        claim.code === input.code &&
        recordClaimStatus(existingEntries.get(claim.id) ?? []) !== 'VOID',
    );
    if (duplicate) {
      throw new Error('A non-void claim already exists for this record code and Official result revision');
    }
    this.repository.appendRecordClaim({
      id: crypto.randomUUID(),
      championshipId: input.championshipId,
      source,
      code: input.code,
      resultBasis: input.resultBasis,
      benchmarkScoreX10: input.benchmarkScoreX10,
      ruleReference: recordRule(input.code),
      claimedBy: required(input.claimedBy, 'claimedBy'),
      achievedAt: validDate(input.achievedAt, 'achievedAt'),
      createdAt: this.now(),
    });
    return this.getWorkspace(input.championshipId);
  }

  async appendRecordClaimEntry(input: {
    championshipId: string;
    claimId: string;
    type: RecordClaimEntry['type'];
    statement: string;
    officialName: string;
    appointmentId?: string;
    reference?: string;
  }): Promise<ResultsBookWorkspaceDto> {
    const claim = this.repository.findRecordClaimById(input.claimId);
    if (!claim || claim.championshipId !== input.championshipId) throw new Error('Record claim not found');
    const entries = this.repository.findRecordClaimEntries([claim.id]).get(claim.id) ?? [];
    const status = recordClaimStatus(entries);
    assertRecordTransition(status, input.type);
    if (input.type === 'TD_CONFIRMED') {
      const appointment = activeOfficials(this.repository.findOfficialEntries(input.championshipId)).find(
        (entry) => entry.id === input.appointmentId,
      );
      if (!appointment || appointment.role !== 'TECHNICAL_DELEGATE') {
        throw new Error('An active Technical Delegate appointment must confirm the record report');
      }
      if (appointment.officialName !== input.officialName.trim()) {
        throw new Error('The confirming name must match the selected Technical Delegate appointment');
      }
    }
    if (input.type === 'TECHNICAL_COMMITTEE_VERIFIED' && !input.reference?.trim()) {
      throw new Error('ISSF Technical Committee verification requires a reference');
    }
    if (input.type === 'VOID' && status === 'VERIFIED' && !input.reference?.trim()) {
      throw new Error('Voiding a verified record claim requires a formal correction or withdrawal reference');
    }
    this.repository.appendRecordClaimEntry({
      id: crypto.randomUUID(),
      claimId: claim.id,
      type: input.type,
      statement: required(input.statement, 'statement'),
      officialName: required(input.officialName, 'officialName'),
      appointmentId: optional(input.appointmentId),
      reference: optional(input.reference),
      recordedAt: this.now(),
    });
    return this.getWorkspace(input.championshipId);
  }

  async generateBook(championshipId: string, createdBy: string): Promise<ResultsBookWorkspaceDto> {
    const officialEntries = this.repository.findOfficialEntries(championshipId);
    const officials = activeOfficials(officialEntries);
    const { verified: claims, unresolved } = this.classifyBookClaims(championshipId);
    const built = await this.source.build(championshipId, officialEntries, claims);
    const requiredSigners = requiredResultsBookSigners(
      officials.map((entry) => ({
        appointmentId: entry.id,
        role: entry.role,
        officialName: entry.officialName,
        organization: entry.organization,
      })),
    ).map(({ appointmentId, role, officialName }) => ({ appointmentId, role, officialName }));
    const findings = [...built.findings];
    if (!officials.some((entry) => entry.role === 'TECHNICAL_DELEGATE')) {
      findings.push('No active Technical Delegate is appointed');
    }
    if (!officials.some((entry) => entry.role.endsWith('_JURY_CHAIR'))) {
      findings.push('No active Jury Chairman is appointed');
    }
    for (const item of unresolved) {
      findings.push(
        `Record claim ${item.claim.code} for ${item.claim.source.subjectName} is unresolved (${item.status})`,
      );
    }
    const versionNumber = (this.repository.findBooks(championshipId).at(-1)?.versionNumber ?? 0) + 1;
    this.repository.appendBook({
      id: crypto.randomUUID(),
      championshipId,
      versionNumber,
      sourceHash: built.sourceHash,
      contentJson: JSON.stringify(built.content),
      findings: [...new Set(findings)],
      requiredSigners,
      createdBy: required(createdBy, 'createdBy'),
      createdAt: this.now(),
    });
    return this.getWorkspace(championshipId);
  }

  async signBook(input: {
    championshipId: string;
    bookId: string;
    appointmentId: string;
    statement: string;
  }): Promise<ResultsBookWorkspaceDto> {
    const book = this.requireBook(input.bookId, input.championshipId);
    if (this.repository.findFinalization(book.id))
      throw new Error('A certified Results Book cannot receive more signatures');
    const signer = book.requiredSigners.find((item) => item.appointmentId === input.appointmentId);
    if (!signer) throw new Error('This appointment is not an authorized signer for this Results Book version');
    const active = activeOfficials(this.repository.findOfficialEntries(input.championshipId));
    if (!active.some((entry) => entry.id === signer.appointmentId)) {
      throw new Error('The selected signer appointment is no longer active; generate a revised Results Book');
    }
    if (this.repository.findSignatures(book.id).some((signature) => signature.appointmentId === signer.appointmentId)) {
      throw new Error('This official already signed this Results Book version');
    }
    this.repository.appendSignature({
      id: crypto.randomUUID(),
      bookId: book.id,
      ...signer,
      statement: required(input.statement, 'statement'),
      signedAt: this.now(),
    });
    return this.getWorkspace(input.championshipId);
  }

  async finalizeBook(input: {
    championshipId: string;
    bookId: string;
    officialName: string;
    statement: string;
  }): Promise<ResultsBookWorkspaceDto> {
    const book = this.requireBook(input.bookId, input.championshipId);
    if (this.repository.findFinalization(book.id)) throw new Error('This Results Book is already certified');
    if (book.findings.length > 0) throw new Error(`Resolve Results Book findings: ${book.findings.join('; ')}`);
    const signatures = this.repository.findSignatures(book.id);
    const signed = new Set(signatures.map((signature) => signature.appointmentId));
    const missing = book.requiredSigners.filter((signer) => !signed.has(signer.appointmentId));
    if (missing.length > 0)
      throw new Error(`Missing certification signatures: ${missing.map((item) => item.officialName).join(', ')}`);
    const claims = this.classifyBookClaims(input.championshipId);
    if (claims.unresolved.length > 0) {
      throw new Error('Resolve all open record claims before certifying the Results Book');
    }
    const current = await this.source.build(
      input.championshipId,
      this.repository.findOfficialEntries(input.championshipId),
      claims.verified,
    );
    if (current.findings.length > 0) {
      throw new Error(`Resolve current Results Book findings: ${current.findings.join('; ')}`);
    }
    if (current.sourceHash !== book.sourceHash) {
      throw new Error('Results Book source data changed; generate and sign a new version');
    }
    this.repository.appendFinalization({
      id: crypto.randomUUID(),
      bookId: book.id,
      sourceHash: book.sourceHash,
      statement: required(input.statement, 'statement'),
      officialName: required(input.officialName, 'officialName'),
      finalizedAt: this.now(),
    });
    return this.getWorkspace(input.championshipId);
  }

  async exportBook(bookId: string, format: 'JSON' | ResultsBookDocumentFormat = 'JSON') {
    const book = this.repository.findBookById(bookId);
    if (!book) throw new Error('Results Book not found');
    const finalization = this.repository.findFinalization(book.id);
    if (!finalization) throw new Error('Only a certified Results Book can be exported as official');
    const content = JSON.parse(book.contentJson) as Record<string, unknown>;
    const draftCertification = isRecord(content.resultsCertification) ? content.resultsCertification : {};
    const document = {
      ...content,
      publicationVersion: { bookId: book.id, number: book.versionNumber, createdAt: book.createdAt.toISOString() },
      resultsCertification: {
        ...draftCertification,
        sourceHash: book.sourceHash,
        requiredSigners: book.requiredSigners,
        signatures: this.repository.findSignatures(book.id).map((signature) => ({
          appointmentId: signature.appointmentId,
          role: signature.role,
          officialName: signature.officialName,
          statement: signature.statement,
          signedAt: signature.signedAt.toISOString(),
        })),
        finalizedBy: finalization.officialName,
        finalizedAt: finalization.finalizedAt.toISOString(),
        statement: finalization.statement,
      },
    };
    if (format !== 'JSON') {
      if (!this.documentExporter) throw new Error('Readable Results Book export is unavailable');
      return this.documentExporter.export(
        document,
        format,
        `official-results-book-v${book.versionNumber}.${format.toLowerCase()}`,
      );
    }
    const destination = await this.files.chooseResultsBookDestination(
      `official-results-book-v${book.versionNumber}.json`,
    );
    if (!destination) return { status: 'CANCELLED' as const };
    const output = `${JSON.stringify(document)}\n`;
    await this.files.writeUtf8Atomic(destination, output);
    return {
      status: 'COMPLETED' as const,
      path: destination,
      fileName: basename(destination),
      sizeBytes: Buffer.byteLength(output),
      sha256: createHash('sha256').update(output).digest('hex'),
    };
  }

  private classifyBookClaims(championshipId: string): {
    verified: RecordClaim[];
    unresolved: Array<{ claim: RecordClaim; status: ReturnType<typeof recordClaimStatus> }>;
  } {
    const claims = this.repository.findRecordClaims(championshipId);
    const entries = this.repository.findRecordClaimEntries(claims.map((claim) => claim.id));
    const classified = claims.map((claim) => ({
      claim,
      status: recordClaimStatus(entries.get(claim.id) ?? []),
    }));
    return {
      verified: classified.filter((item) => item.status === 'VERIFIED').map((item) => item.claim),
      unresolved: classified.filter(
        (item) => item.status === 'DRAFT' || item.status === 'TD_CONFIRMED' || item.status === 'SUBMITTED',
      ),
    };
  }

  private requireBook(bookId: string, championshipId: string): ResultsBookVersion {
    const book = this.repository.findBookById(bookId);
    if (!book || book.championshipId !== championshipId) throw new Error('Results Book not found');
    return book;
  }

  private toBookDto(book: ResultsBookVersion) {
    const signatures = this.repository.findSignatures(book.id);
    const finalization = this.repository.findFinalization(book.id);
    return {
      id: book.id,
      championshipId: book.championshipId,
      versionNumber: book.versionNumber,
      sourceHash: book.sourceHash,
      findings: [...book.findings],
      requiredSigners: [...book.requiredSigners],
      signatures: signatures.map((signature) => ({
        id: signature.id,
        appointmentId: signature.appointmentId,
        role: signature.role,
        officialName: signature.officialName,
        statement: signature.statement,
        signedAt: signature.signedAt.toISOString(),
      })),
      createdBy: book.createdBy,
      createdAt: book.createdAt.toISOString(),
      status: finalization ? ('CERTIFIED' as const) : ('DRAFT' as const),
      finalizedAt: finalization?.finalizedAt.toISOString() ?? null,
    };
  }
}

function activeOfficials(entries: readonly ChampionshipOfficialEntry[]): ChampionshipOfficialEntry[] {
  const revoked = new Set(entries.flatMap((entry) => (entry.reversesEntryId ? [entry.reversesEntryId] : [])));
  return entries.filter((entry) => entry.operation === 'APPOINT' && !revoked.has(entry.id));
}

function toClaimDto(claim: RecordClaim, entries: readonly RecordClaimEntry[]) {
  return {
    id: claim.id,
    championshipId: claim.championshipId,
    source: toEligibleResultDto(claim.source),
    code: claim.code,
    resultBasis: claim.resultBasis,
    benchmarkScoreX10: claim.benchmarkScoreX10,
    ruleReference: claim.ruleReference,
    claimedBy: claim.claimedBy,
    achievedAt: claim.achievedAt.toISOString(),
    createdAt: claim.createdAt.toISOString(),
    status: recordClaimStatus(entries),
    entries: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      statement: entry.statement,
      officialName: entry.officialName,
      appointmentId: entry.appointmentId,
      reference: entry.reference,
      recordedAt: entry.recordedAt.toISOString(),
    })),
  };
}

function toEligibleResultDto(result: RecordClaim['source']): ResultsBookWorkspaceDto['eligibleRecordResults'][number] {
  return {
    ...result,
    members: result.members?.map((member) => ({ ...member })),
  };
}

function recordRule(code: RecordCode): string {
  if (['OR', 'EOR', 'QOR', 'EQOR'].includes(code)) return 'ISSF 3.10.2.1, 6.14.9.1, 6.14.9.4, Annex R';
  if (['QWR', 'EQWR', 'QWRJ', 'EQWRJ'].includes(code)) {
    return 'ISSF 3.10.2.3, 6.14.9.3, 6.14.9.4, Annex R';
  }
  if (['WRJ', 'EWRJ'].includes(code)) return 'ISSF 3.10.2.2, 6.14.9.2, 6.14.9.4, Annex R';
  return 'ISSF 3.10.2.2, 6.14.9, 6.14.9.4, Annex R';
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function optional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validDate(value: string, name: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${name} must be valid`);
  return date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

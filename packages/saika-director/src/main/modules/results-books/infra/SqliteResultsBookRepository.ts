import type Database from 'better-sqlite3';

import type { IResultsBookRepository } from '../domain/IResultsBookRepository';
import type {
  ChampionshipOfficialEntry,
  RecordClaim,
  RecordClaimEntry,
  ResultsBookFinalization,
  ResultsBookSignature,
  ResultsBookVersion,
} from '../domain/ResultsBookModels';
import type { ChampionshipOfficialRole, RecordCode, RecordResultBasis } from '../domain/ResultsBookPolicy';

interface OfficialRow {
  id: string;
  championship_id: string;
  operation: 'APPOINT' | 'REVOKE';
  role: ChampionshipOfficialRole;
  official_name: string;
  organization: string | null;
  statement: string;
  recorded_by: string;
  recorded_at: string;
  reverses_entry_id: string | null;
}
interface ClaimRow {
  id: string;
  championship_id: string;
  source_json: string;
  record_code: RecordCode;
  result_basis: RecordResultBasis;
  benchmark_score_x10: number;
  rule_reference: string;
  claimed_by: string;
  achieved_at: string;
  created_at: string;
}
interface ClaimEntryRow {
  id: string;
  claim_id: string;
  entry_type: RecordClaimEntry['type'];
  statement: string;
  official_name: string;
  appointment_id: string | null;
  reference: string | null;
  recorded_at: string;
}
interface BookRow {
  id: string;
  championship_id: string;
  version_number: number;
  source_hash: string;
  content_json: string;
  findings_json: string;
  required_signers_json: string;
  created_by: string;
  created_at: string;
}
interface SignatureRow {
  id: string;
  book_id: string;
  appointment_id: string;
  role: ChampionshipOfficialRole;
  official_name: string;
  statement: string;
  signed_at: string;
}
interface FinalizationRow {
  id: string;
  book_id: string;
  source_hash: string;
  statement: string;
  official_name: string;
  finalized_at: string;
}

export class SqliteResultsBookRepository implements IResultsBookRepository {
  constructor(private readonly db: Database.Database) {}

  appendOfficialEntry(entry: ChampionshipOfficialEntry): void {
    this.db
      .prepare(
        `INSERT INTO championship_official_entries (
      id, championship_id, operation, role, official_name, organization, statement, recorded_by, recorded_at,
      reverses_entry_id
    ) VALUES (
      @id, @championshipId, @operation, @role, @officialName, @organization, @statement, @recordedBy, @recordedAt,
      @reversesEntryId
    )`,
      )
      .run({ ...entry, recordedAt: entry.recordedAt.toISOString() });
  }

  findOfficialEntries(championshipId: string): ChampionshipOfficialEntry[] {
    return (
      this.db
        .prepare('SELECT * FROM championship_official_entries WHERE championship_id = ? ORDER BY recorded_at, rowid')
        .all(championshipId) as OfficialRow[]
    ).map((row) => ({
      id: row.id,
      championshipId: row.championship_id,
      operation: row.operation,
      role: row.role,
      officialName: row.official_name,
      organization: row.organization,
      statement: row.statement,
      recordedBy: row.recorded_by,
      recordedAt: new Date(row.recorded_at),
      reversesEntryId: row.reverses_entry_id,
    }));
  }

  appendRecordClaim(claim: RecordClaim): void {
    this.db
      .prepare(
        `INSERT INTO record_claims (
      id, championship_id, event_id, result_id, result_scope, source_json, record_code, result_basis,
      benchmark_score_x10, rule_reference, claimed_by, achieved_at, created_at
    ) VALUES (
      @id, @championshipId, @eventId, @resultId, @resultScope, @sourceJson, @code, @resultBasis,
      @benchmarkScoreX10, @ruleReference, @claimedBy, @achievedAt, @createdAt
    )`,
      )
      .run({
        id: claim.id,
        championshipId: claim.championshipId,
        eventId: claim.source.eventId,
        resultId: claim.source.resultId,
        resultScope: claim.source.resultScope,
        sourceJson: JSON.stringify(claim.source),
        code: claim.code,
        resultBasis: claim.resultBasis,
        benchmarkScoreX10: claim.benchmarkScoreX10,
        ruleReference: claim.ruleReference,
        claimedBy: claim.claimedBy,
        achievedAt: claim.achievedAt.toISOString(),
        createdAt: claim.createdAt.toISOString(),
      });
  }

  appendRecordClaimEntry(entry: RecordClaimEntry): void {
    this.db
      .prepare(
        `INSERT INTO record_claim_entries (
      id, claim_id, entry_type, statement, official_name, appointment_id, reference, recorded_at
    ) VALUES (
      @id, @claimId, @type, @statement, @officialName, @appointmentId, @reference, @recordedAt
    )`,
      )
      .run({ ...entry, recordedAt: entry.recordedAt.toISOString() });
  }

  findRecordClaims(championshipId: string): RecordClaim[] {
    return (
      this.db
        .prepare('SELECT * FROM record_claims WHERE championship_id = ? ORDER BY achieved_at, rowid')
        .all(championshipId) as ClaimRow[]
    ).map(toClaim);
  }

  findRecordClaimById(claimId: string): RecordClaim | null {
    const row = this.db.prepare('SELECT * FROM record_claims WHERE id = ?').get(claimId) as ClaimRow | undefined;
    return row ? toClaim(row) : null;
  }

  findRecordClaimEntries(claimIds: readonly string[]): Map<string, RecordClaimEntry[]> {
    const result = new Map(claimIds.map((id) => [id, [] as RecordClaimEntry[]]));
    if (claimIds.length === 0) return result;
    const rows = this.db
      .prepare(
        `SELECT * FROM record_claim_entries WHERE claim_id IN (${claimIds.map(() => '?').join(',')}) ORDER BY recorded_at, rowid`,
      )
      .all(...claimIds) as ClaimEntryRow[];
    for (const row of rows) result.get(row.claim_id)?.push(toClaimEntry(row));
    return result;
  }

  appendBook(book: ResultsBookVersion): void {
    this.db
      .prepare(
        `INSERT INTO results_book_versions (
      id, championship_id, version_number, source_hash, content_json, findings_json, required_signers_json,
      created_by, created_at
    ) VALUES (
      @id, @championshipId, @versionNumber, @sourceHash, @contentJson, @findingsJson, @requiredSignersJson,
      @createdBy, @createdAt
    )`,
      )
      .run({
        ...book,
        findingsJson: JSON.stringify(book.findings),
        requiredSignersJson: JSON.stringify(book.requiredSigners),
        createdAt: book.createdAt.toISOString(),
      });
  }

  findBooks(championshipId: string): ResultsBookVersion[] {
    return (
      this.db
        .prepare('SELECT * FROM results_book_versions WHERE championship_id = ? ORDER BY version_number, rowid')
        .all(championshipId) as BookRow[]
    ).map(toBook);
  }

  findBookById(bookId: string): ResultsBookVersion | null {
    const row = this.db.prepare('SELECT * FROM results_book_versions WHERE id = ?').get(bookId) as BookRow | undefined;
    return row ? toBook(row) : null;
  }

  appendSignature(signature: ResultsBookSignature): void {
    this.db
      .prepare(
        `INSERT INTO results_book_signatures (
      id, book_id, appointment_id, role, official_name, statement, signed_at
    ) VALUES (@id, @bookId, @appointmentId, @role, @officialName, @statement, @signedAt)`,
      )
      .run({
        ...signature,
        signedAt: signature.signedAt.toISOString(),
      });
  }

  findSignatures(bookId: string): ResultsBookSignature[] {
    return (
      this.db
        .prepare('SELECT * FROM results_book_signatures WHERE book_id = ? ORDER BY signed_at, rowid')
        .all(bookId) as SignatureRow[]
    ).map((row) => ({
      id: row.id,
      bookId: row.book_id,
      appointmentId: row.appointment_id,
      role: row.role,
      officialName: row.official_name,
      statement: row.statement,
      signedAt: new Date(row.signed_at),
    }));
  }

  appendFinalization(finalization: ResultsBookFinalization): void {
    this.db
      .prepare(
        `INSERT INTO results_book_finalizations (
      id, book_id, source_hash, statement, official_name, finalized_at
    ) VALUES (@id, @bookId, @sourceHash, @statement, @officialName, @finalizedAt)`,
      )
      .run({
        ...finalization,
        finalizedAt: finalization.finalizedAt.toISOString(),
      });
  }

  findFinalization(bookId: string): ResultsBookFinalization | null {
    const row = this.db.prepare('SELECT * FROM results_book_finalizations WHERE book_id = ?').get(bookId) as
      FinalizationRow | undefined;
    return row
      ? {
          id: row.id,
          bookId: row.book_id,
          sourceHash: row.source_hash,
          statement: row.statement,
          officialName: row.official_name,
          finalizedAt: new Date(row.finalized_at),
        }
      : null;
  }
}

function toClaim(row: ClaimRow): RecordClaim {
  return {
    id: row.id,
    championshipId: row.championship_id,
    source: JSON.parse(row.source_json) as RecordClaim['source'],
    code: row.record_code,
    resultBasis: row.result_basis,
    benchmarkScoreX10: row.benchmark_score_x10,
    ruleReference: row.rule_reference,
    claimedBy: row.claimed_by,
    achievedAt: new Date(row.achieved_at),
    createdAt: new Date(row.created_at),
  };
}

function toClaimEntry(row: ClaimEntryRow): RecordClaimEntry {
  return {
    id: row.id,
    claimId: row.claim_id,
    type: row.entry_type,
    statement: row.statement,
    officialName: row.official_name,
    appointmentId: row.appointment_id,
    reference: row.reference,
    recordedAt: new Date(row.recorded_at),
  };
}

function toBook(row: BookRow): ResultsBookVersion {
  return {
    id: row.id,
    championshipId: row.championship_id,
    versionNumber: row.version_number,
    sourceHash: row.source_hash,
    contentJson: row.content_json,
    findings: JSON.parse(row.findings_json) as string[],
    requiredSigners: JSON.parse(row.required_signers_json) as ResultsBookVersion['requiredSigners'],
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
  };
}

import type {
  ChampionshipOfficialEntry,
  RecordClaim,
  RecordClaimEntry,
  ResultsBookFinalization,
  ResultsBookSignature,
  ResultsBookVersion,
} from './ResultsBookModels';

export interface IResultsBookRepository {
  appendOfficialEntry(entry: ChampionshipOfficialEntry): void;
  findOfficialEntries(championshipId: string): ChampionshipOfficialEntry[];
  appendRecordClaim(claim: RecordClaim): void;
  appendRecordClaimEntry(entry: RecordClaimEntry): void;
  findRecordClaims(championshipId: string): RecordClaim[];
  findRecordClaimById(claimId: string): RecordClaim | null;
  findRecordClaimEntries(claimIds: readonly string[]): Map<string, RecordClaimEntry[]>;
  appendBook(book: ResultsBookVersion): void;
  findBooks(championshipId: string): ResultsBookVersion[];
  findBookById(bookId: string): ResultsBookVersion | null;
  appendSignature(signature: ResultsBookSignature): void;
  findSignatures(bookId: string): ResultsBookSignature[];
  appendFinalization(finalization: ResultsBookFinalization): void;
  findFinalization(bookId: string): ResultsBookFinalization | null;
}

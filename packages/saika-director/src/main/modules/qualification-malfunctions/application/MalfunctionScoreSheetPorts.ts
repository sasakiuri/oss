import type { MalfunctionScoreSheet } from '../domain/MalfunctionScoreSheet';

export interface IMalfunctionScoreSheetRepository {
  find(id: string): MalfunctionScoreSheet | null;
  list(caseId: string): MalfunctionScoreSheet[];
  append(value: MalfunctionScoreSheet): void;
}

export interface IMalfunctionScoreSheetExporter {
  export(
    sheet: MalfunctionScoreSheet,
  ): Promise<{ status: 'CANCELLED' } | { status: 'COMPLETED'; path: string; sha256: string; sizeBytes: number }>;
}

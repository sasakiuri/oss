// SPDX-License-Identifier: MIT
export type ResultsBookDocumentFormat = 'HTML' | 'PDF';
export type ResultsBookExportResult =
  | { readonly status: 'CANCELLED' }
  | {
      readonly status: 'COMPLETED';
      readonly path: string;
      readonly fileName: string;
      readonly sizeBytes: number;
      readonly sha256: string;
    };

/** Receives the same certified snapshot used by JSON export. Owns no scoring or certification policy. */
export interface IResultsBookDocumentExporter {
  export(
    document: Readonly<Record<string, unknown>>,
    format: ResultsBookDocumentFormat,
    suggestedName: string,
  ): Promise<ResultsBookExportResult>;
}

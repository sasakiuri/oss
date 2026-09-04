export interface SelectedEstBackupRecordFile {
  readonly fileName: string;
  readonly content: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

/** Keeps Electron file access outside the EST comparison and parsing policies. */
export interface IEstBackupRecordFileGateway {
  chooseSource(): Promise<SelectedEstBackupRecordFile | null>;
}

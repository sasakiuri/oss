import type { EstBackupRecordImportReceiptDto } from '@/shared/ipc/contracts';
import type { EstBackupRecordParserRegistry } from '../domain/EstBackupRecordParser';
import type { IEstBackupRecordFileGateway } from './EstBackupRecordFileGateway';

export class EstBackupRecordImportService {
  constructor(
    private readonly files: IEstBackupRecordFileGateway,
    private readonly parsers: EstBackupRecordParserRegistry,
  ) {}

  async importRecords(): Promise<EstBackupRecordImportReceiptDto> {
    const source = await this.files.chooseSource();
    if (!source) return { status: 'CANCELLED' };
    const parsed = this.parsers.parse(source.fileName, source.content);
    return {
      status: 'IMPORTED',
      fileName: source.fileName,
      sizeBytes: source.sizeBytes,
      sha256: source.sha256,
      format: parsed.format,
      sourceName: source.fileName,
      sourceReference: `${parsed.format}; ${source.sizeBytes} bytes; SHA-256 ${source.sha256}`,
      records: [...parsed.records],
    };
  }
}

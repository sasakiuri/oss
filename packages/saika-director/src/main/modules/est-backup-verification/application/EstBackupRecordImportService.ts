import type { EstBackupRecordImportReceiptDto } from '@/shared/ipc/contracts';
import { EstBackupRecordParserRegistry, type EstBackupRecordParser } from '../domain/EstBackupRecordParser';
import type { IEstBackupRecordFileGateway } from './EstBackupRecordFileGateway';

export class EstBackupRecordImportService {
  constructor(
    private readonly files: IEstBackupRecordFileGateway,
    private readonly parsers: EstBackupRecordParserRegistry,
  ) {}

  async importRecords(parser?: EstBackupRecordParser): Promise<EstBackupRecordImportReceiptDto> {
    const parsers = parser ? new EstBackupRecordParserRegistry([parser]) : this.parsers;
    const source = await this.files.chooseSource(parsers.supportedExtensions);
    if (!source) return { status: 'CANCELLED' };
    const parsed = parsers.parse(source.fileName, source.content);
    return {
      status: 'IMPORTED',
      fileName: source.fileName,
      sizeBytes: source.sizeBytes,
      sha256: source.sha256,
      format: parsed.format,
      sourceName: source.fileName,
      sourceReference: `${parsed.format}; ${source.sizeBytes} bytes; SHA-256 ${source.sha256}${parsed.sourceDescription ? `; ${parsed.sourceDescription}` : ''}`,
      records: [...parsed.records],
    };
  }
}

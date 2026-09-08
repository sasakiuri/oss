import type { IEstBackupSourceRetention } from '@/main/modules/est-backup-sources';
import type { EstBackupRecordImportReceiptDto } from '@/shared/ipc/contracts';

import { EstBackupRecordParserRegistry, type EstBackupRecordParser } from '../domain/EstBackupRecordParser';

import type { IEstBackupRecordFileGateway, SelectedEstBackupRecordFile } from './EstBackupRecordFileGateway';

export class EstBackupRecordImportService {
  constructor(
    private readonly files: IEstBackupRecordFileGateway,
    private readonly parsers: EstBackupRecordParserRegistry,
    private readonly sources?: IEstBackupSourceRetention,
  ) {}

  async importRecords(parser?: EstBackupRecordParser, eventId?: string): Promise<EstBackupRecordImportReceiptDto> {
    if (eventId && !this.sources) throw new Error('Backup source retention is not installed');
    const parsers = parser ? new EstBackupRecordParserRegistry([parser]) : this.parsers;
    const source = await this.files.chooseSource(parsers.supportedExtensions);
    if (!source) return { status: 'CANCELLED' };
    return this.captureSource(source, eventId, parser);
  }

  captureSource(
    source: SelectedEstBackupRecordFile,
    eventId?: string,
    parser?: EstBackupRecordParser,
  ): Extract<EstBackupRecordImportReceiptDto, { status: 'IMPORTED' }> {
    if (eventId && !this.sources) throw new Error('Backup source retention is not installed');
    const parsers = parser ? new EstBackupRecordParserRegistry([parser]) : this.parsers;
    const parsed = parsers.parse(source.fileName, source.content);
    const receipt: Extract<EstBackupRecordImportReceiptDto, { status: 'IMPORTED' }> = {
      status: 'IMPORTED',
      fileName: source.fileName,
      sizeBytes: source.sizeBytes,
      sha256: source.sha256,
      format: parsed.format,
      sourceName: source.fileName,
      sourceReference: `${parsed.format}; ${source.sizeBytes} bytes; SHA-256 ${source.sha256}${parsed.sourceDescription ? `; ${parsed.sourceDescription}` : ''}`,
      records: [...parsed.records],
    };
    if (!eventId) return receipt;
    const retained = this.sources!.retain(eventId, source.content, receipt);
    return { ...receipt, sourceId: retained.id, sourceReference: retained.sourceReference };
  }
}

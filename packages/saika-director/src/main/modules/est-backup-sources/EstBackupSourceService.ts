import { createHash, randomUUID } from 'node:crypto';

import {
  EstBackupSourceSchema,
  type EstBackupSourceDto,
  type EstBackupSourceSummaryDto,
  type EstBackupRecordImportReceiptDto,
} from '@/shared/ipc/contracts/estBackupVerification.contract';

export interface IEstBackupSourceRepository {
  append(source: EstBackupSourceDto): void;
  find(id: string): EstBackupSourceDto | null;
  list(eventId: string): EstBackupSourceSummaryDto[];
}
export interface IEstBackupSourceReader {
  get(id: string): EstBackupSourceDto;
}
export interface IEstBackupSourceRetention {
  retain(
    eventId: string,
    content: string,
    receipt: Extract<EstBackupRecordImportReceiptDto, { status: 'IMPORTED' }>,
  ): EstBackupSourceDto;
}

/** Stores acquired evidence without access to competition scores, rankings or result approvals. */
export class EstBackupSourceService implements IEstBackupSourceReader, IEstBackupSourceRetention {
  constructor(
    private readonly repository: IEstBackupSourceRepository,
    private readonly eventExists: (id: string) => boolean,
    private readonly now: () => Date = () => new Date(),
  ) {}
  retain(eventId: string, content: string, receipt: Extract<EstBackupRecordImportReceiptDto, { status: 'IMPORTED' }>) {
    if (!this.eventExists(eventId)) throw new Error('Select an existing event before retaining a backup source');
    const id = randomUUID();
    const source = EstBackupSourceSchema.parse({
      ...receipt,
      id,
      eventId,
      content,
      sourceReference: `EST_SOURCE:${id}; ${receipt.sourceReference}`,
      recordsSha256: backupRecordsDigest(receipt.records),
      recordCount: receipt.records.length,
      importedAt: this.now().toISOString(),
    });
    assertIntegrity(source);
    this.repository.append(source);
    return source;
  }
  get(id: string): EstBackupSourceDto {
    const found = this.repository.find(id);
    if (!found) throw new Error('The retained EST backup source was not found');
    const source = EstBackupSourceSchema.parse(found);
    if (source.id !== id) throw new Error('The backup source identity does not match');
    assertIntegrity(source);
    return source;
  }
  list(eventId: string): EstBackupSourceSummaryDto[] {
    return this.repository.list(eventId);
  }
}

export function backupRecordsDigest(records: EstBackupSourceDto['records']): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        records.map((record) => ({
          key: record.key,
          rank: record.rank ?? null,
          totalScore: record.totalScore,
        })),
      ),
    )
    .digest('hex');
}
function assertIntegrity(source: EstBackupSourceDto) {
  if (
    Buffer.byteLength(source.content, 'utf8') !== source.sizeBytes ||
    createHash('sha256').update(source.content, 'utf8').digest('hex') !== source.sha256 ||
    backupRecordsDigest(source.records) !== source.recordsSha256 ||
    source.records.length !== source.recordCount
  )
    throw new Error('Retained backup source integrity check failed');
}

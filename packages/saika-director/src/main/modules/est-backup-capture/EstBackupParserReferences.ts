import { ColumnMappedEstBackupRecordParser } from '@/main/modules/est-backup-verification/domain/ColumnMappedEstBackupRecordParser';
import type { EstBackupRecordParser } from '@/main/modules/est-backup-verification/domain/EstBackupRecordParser';
import { EstBackupColumnMappingSchema } from '@/shared/ipc/contracts/estBackupVerification.contract';

import type { EstBackupAdapterReference } from './EstBackupCapturePersistence';

/** Restores only explicitly supported formats; an unknown parser never falls back to another layout. */
export class EstBackupParserReferences {
  describe(parser: EstBackupRecordParser): EstBackupAdapterReference {
    if (!(parser instanceof ColumnMappedEstBackupRecordParser))
      throw new Error('This backup parser cannot be restored; register its configuration adapter first');
    return { adapter: 'MAPPED_DELIMITED_V1', options: { ...parser.mapping } };
  }
  restore(reference: EstBackupAdapterReference): EstBackupRecordParser {
    if (reference.adapter !== 'MAPPED_DELIMITED_V1') throw new Error('The saved backup parser is not supported');
    return new ColumnMappedEstBackupRecordParser(EstBackupColumnMappingSchema.parse(reference.options));
  }
}

import { basename, isAbsolute } from 'node:path';

import { chooseEstBackupSourcePath, readEstBackupRecordFile } from '@/main/modules/est-backup-verification';

import type { EstBackupAdapterReference } from './EstBackupCapturePersistence';
import type { IEstBackupFeedSelector } from './EstBackupCaptureService';

export class ElectronEstBackupFeedSelector implements IEstBackupFeedSelector {
  async choose(extensions: readonly string[]) {
    const path = await chooseEstBackupSourcePath(extensions);
    return path ? this.restore({ adapter: 'FILE_V1', options: { path } }) : null;
  }
  async restore(reference: EstBackupAdapterReference) {
    const path = reference.options.path;
    if (reference.adapter !== 'FILE_V1' || typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))
      throw new Error('The saved backup file reference is not supported; choose the source again');
    return { label: basename(path), reference, read: () => readEstBackupRecordFile(path) };
  }
}

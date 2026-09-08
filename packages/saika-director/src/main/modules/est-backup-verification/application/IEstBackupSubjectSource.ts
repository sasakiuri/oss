import type { CreateEstBackupVerificationPayload } from '@/shared/ipc/contracts';
import type { OfficialBackupSubject } from '../domain/EstBackupComparator';

/** Supplies comparison facts without exposing scoring mutations or approval operations. */
export interface IEstBackupSubjectSource {
  load(
    input: Pick<CreateEstBackupVerificationPayload, 'eventId' | 'resultKind' | 'keyType'>,
  ): Promise<OfficialBackupSubject[]>;
}

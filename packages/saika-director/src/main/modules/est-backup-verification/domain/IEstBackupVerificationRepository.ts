import type { CreateEstBackupVerificationPayload, EstBackupVerificationRunDto } from '@/shared/ipc/contracts';

export interface IEstBackupVerificationRepository {
  append(run: EstBackupVerificationRunDto, records: CreateEstBackupVerificationPayload['records']): void;
  findByEvent(eventId: string): EstBackupVerificationRunDto[];
}

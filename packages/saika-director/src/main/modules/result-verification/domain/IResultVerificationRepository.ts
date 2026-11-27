import type { ResultScope } from '@/shared/ipc/contracts';
import type { ResultListApprovalEntry } from './ResultListApprovalEntry';
import type { ResultVerificationCheck } from './ResultVerificationCheck';

export interface IResultVerificationRepository {
  appendCheck(check: ResultVerificationCheck): void;
  findChecksByEvent(eventId: string): ResultVerificationCheck[];
  appendApprovalEntry(entry: ResultListApprovalEntry): void;
  findApprovalEntryById(id: string): ResultListApprovalEntry | null;
  findApprovalEntriesByEvent(eventId: string, scope: ResultScope): ResultListApprovalEntry[];
}

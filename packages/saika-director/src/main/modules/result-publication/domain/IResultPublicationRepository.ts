import type { ResultScope } from '@/shared/ipc/contracts';
import type { ResultPublicationEntry } from './ResultPublicationEntry';

export interface IResultPublicationRepository {
  append(entry: ResultPublicationEntry): void;
  findByEvent(eventId: string, resultScope: ResultScope): ResultPublicationEntry[];
}

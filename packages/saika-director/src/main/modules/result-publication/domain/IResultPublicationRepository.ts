import type { ResultScope } from '@/main/domain/resultScope';
import type { ResultPublicationEntry } from './ResultPublicationEntry';

export interface IResultPublicationRepository {
  append(entry: ResultPublicationEntry): void;
  findByEvent(eventId: string, resultScope: ResultScope): ResultPublicationEntry[];
}

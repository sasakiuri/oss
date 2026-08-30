import type { ResultPublicationEntry, ResultPublicationScope } from './ResultPublicationEntry';

export interface IResultPublicationRepository {
  append(entry: ResultPublicationEntry): void;
  findByEvent(eventId: string, resultScope: ResultPublicationScope): ResultPublicationEntry[];
}

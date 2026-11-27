import type { ResultScope } from '@/main/domain/resultScope';
import type { IResultPublicationBlocker } from './ResultPublicationPorts';

/** Runtime installation policy is separate from the ledger and its factual review. */
export class OptionalResultPublicationBlocker implements IResultPublicationBlocker {
  constructor(
    private readonly source: IResultPublicationBlocker,
    private readonly enabled: (eventId: string, resultScope: ResultScope) => boolean,
  ) {}
  getIssues(eventId: string, resultScope: ResultScope) {
    return this.enabled(eventId, resultScope) ? this.source.getIssues(eventId, resultScope) : [];
  }
}

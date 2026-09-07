import type { IResultPublicationBlocker } from './ResultPublicationPorts';

/** Runtime installation policy is separate from the ledger and its factual review. */
export class OptionalResultPublicationBlocker implements IResultPublicationBlocker {
  constructor(
    private readonly source: IResultPublicationBlocker,
    private readonly enabled: () => boolean,
  ) {}
  getIssues(eventId: string, resultScope: 'QUALIFICATION' | 'FINAL') {
    return this.enabled() ? this.source.getIssues(eventId, resultScope) : [];
  }
}

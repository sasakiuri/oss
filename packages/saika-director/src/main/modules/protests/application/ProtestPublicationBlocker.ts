import type { IResultPublicationBlocker } from '@/main/modules/result-publication';

import type { IProtestRepository } from '../domain/IProtestRepository';
import { protestStatus } from '../domain/ProtestEntry';

/** Reads current case history without registering, resolving or altering a result-list protest. */
export class ProtestPublicationBlocker implements IResultPublicationBlocker {
  constructor(
    private readonly repository: IProtestRepository,
    private readonly competitionIdsForEvent: (
      eventId: string,
      resultScope: 'QUALIFICATION' | 'FINAL',
    ) => readonly string[] = () => [],
  ) {}

  getIssues(eventId: string, resultScope: 'QUALIFICATION' | 'FINAL'): readonly string[] {
    const cases = [
      ...new Map(
        [
          ...this.repository.findCasesByScope('EVENT', eventId),
          ...this.competitionIdsForEvent(eventId, resultScope).flatMap((id) =>
            this.repository.findCasesByScope('COMPETITION', id),
          ),
        ].map((value) => [value.id, value]),
      ).values(),
    ].filter((value) => resultScope === 'FINAL' || value.kind !== 'FINAL_VERBAL');
    const entries = this.repository.findEntries(cases.map((value) => value.id));
    return cases.flatMap((value) => {
      const status = protestStatus(entries.get(value.id) ?? []);
      return status === 'CLOSED' || status === 'VOID'
        ? []
        : [`Protest ${value.id}: ${value.subject} (${status}). Complete the case review before official publication.`];
    });
  }
}

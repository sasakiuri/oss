import type { IResultPublicationBlocker } from '@/main/modules/result-publication';

import { finalRecoveryStatus } from '../domain/FinalRecoveryCase';
import type { IFinalRecoveryRepository } from '../domain/IFinalRecoveryRepository';

export class FinalRecoveryPublicationBlocker implements IResultPublicationBlocker {
  constructor(
    private readonly repository: IFinalRecoveryRepository,
    private readonly competitionIdsForEvent: (eventId: string) => readonly string[] = () => [],
  ) {}
  getIssues(eventId: string, resultScope: 'QUALIFICATION' | 'FINAL'): readonly string[] {
    if (resultScope !== 'FINAL') return [];
    const cases = [
      ...new Map(
        [
          ...this.repository.findCasesByEvent(eventId),
          ...this.competitionIdsForEvent(eventId).flatMap((id) => this.repository.findCasesByCompetition(id)),
        ].map((value) => [value.id, value]),
      ).values(),
    ];
    const entries = this.repository.findEntries(cases.map((value) => value.id));
    return cases.flatMap((value) => {
      const status = finalRecoveryStatus(entries.get(value.id) ?? []);
      return status === 'COMPLETED' || status === 'VOID'
        ? []
        : [`Final recovery case ${value.id} is unresolved (${status})`];
    });
  }
}

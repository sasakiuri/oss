import type { IResultPublicationBlocker } from '@/main/modules/result-publication';

import type { IQualificationMalfunctionRepository } from '../domain/IQualificationMalfunctionRepository';
import { qualificationMalfunctionStatus } from '../domain/QualificationMalfunctionCase';

/** Keeps publication concerns outside the malfunction ledger while enforcing completed audit trails. */
export class QualificationMalfunctionPublicationBlocker implements IResultPublicationBlocker {
  constructor(private readonly repository: IQualificationMalfunctionRepository) {}

  getIssues(eventId: string, resultScope: 'QUALIFICATION' | 'FINAL'): readonly string[] {
    if (resultScope !== 'QUALIFICATION') return [];
    const values = this.repository.findCasesByEvent(eventId);
    const entriesByCase = this.repository.findEntries(values.map((value) => value.id));
    const issues: string[] = [];
    for (const value of values) {
      const entries = entriesByCase.get(value.id) ?? [];
      const status = qualificationMalfunctionStatus(entries);
      if (status === 'VOID') continue;
      if (status !== 'COMPLETED') {
        issues.push(`Qualification malfunction case ${value.id} is unresolved`);
        continue;
      }
      const requiredTypes = ['CLASSIFIED', 'REMEDY_AUTHORIZED', 'EXECUTION_RECORDED', 'SCORE_SETTLED'] as const;
      if (requiredTypes.some((type) => !entries.some((entry) => entry.type === type))) {
        issues.push(`Qualification malfunction case ${value.id} has an incomplete audit trail`);
      }
    }
    return issues;
  }
}

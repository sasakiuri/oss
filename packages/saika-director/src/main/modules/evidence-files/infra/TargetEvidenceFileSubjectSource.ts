import type { ITargetExaminationRepository } from '@/main/modules/target-examinations';
import { getTargetExaminationState } from '@/main/modules/target-examinations';
import type { IEvidenceFileSubjectSource } from '../domain/EvidenceFile';

export class TargetEvidenceFileSubjectSource implements IEvidenceFileSubjectSource {
  constructor(private readonly repository: ITargetExaminationRepository) {}
  assertAttachable(caseId: string, evidenceId: string) {
    const examination = this.repository.findCaseById(caseId);
    if (!examination) throw new Error('Target examination not found');
    const entries = this.repository.findEntriesByCaseIds([caseId]).get(caseId) ?? [];
    if (getTargetExaminationState(entries).status !== 'OPEN')
      throw new Error('Reopen the examination before importing evidence');
    const evidence = this.repository
      .findEvidenceByCaseIds([caseId])
      .get(caseId)
      ?.find((item) => item.id === evidenceId);
    if (!evidence) throw new Error('The evidence item does not belong to this examination');
    return { expectedSha256: evidence.contentHashSha256 };
  }
}

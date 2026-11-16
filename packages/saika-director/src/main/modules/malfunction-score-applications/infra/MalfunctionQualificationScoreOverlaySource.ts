import type { IQualificationScoreOverlaySource, Result } from '@/main/modules/results';
import {
  qualificationMalfunctionStatus,
  type IQualificationMalfunctionRepository,
} from '@/main/modules/qualification-malfunctions';
import type { IMalfunctionScoreApplicationRepository } from '../domain/MalfunctionScoreApplication';
import { sha256Json } from '@/main/domain/sha256Json';

export class MalfunctionQualificationScoreOverlaySource implements IQualificationScoreOverlaySource {
  constructor(
    private readonly applications: IMalfunctionScoreApplicationRepository,
    private readonly cases: IQualificationMalfunctionRepository,
  ) {}
  forResult(result: Result) {
    const applications = this.applications.byTarget(
      result.eventId.value,
      result.participantId.value,
      result.relayNumber,
    );
    const history = applications.map((application) => ({
      application,
      withdrawal: this.applications.withdrawal(application.id),
      status: qualificationMalfunctionStatus(
        this.cases.findEntries([application.caseId]).get(application.caseId) ?? [],
      ),
    }));
    return {
      revision: history.length ? sha256Json(history) : '',
      active: history
        .filter((item) => !item.withdrawal)
        .map(({ application, status }) => {
          const { id, recordedAt: _time, digest, ...content } = application;
          const issues: string[] = [];
          if (sha256Json(content) !== digest) issues.push('Stored score application digest mismatch');
          if (status !== 'SETTLED' && status !== 'COMPLETED') issues.push(`Malfunction case is ${status}`);
          return { ...application.replacement, id, issues };
        }),
    };
  }
}

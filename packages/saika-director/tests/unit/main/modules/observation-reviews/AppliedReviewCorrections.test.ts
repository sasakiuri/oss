import { expect, it } from 'vitest';
import type { ScoreCorrectionService } from '@/main/modules/score-corrections';
import type {
  IScoreCorrectionRepository,
  ScoreCorrectionApplication,
} from '@/main/modules/score-corrections/domain/ScoreCorrection';
import { AppliedReviewCorrections } from '@/main/modules/observation-reviews/AppliedReviewCorrections';
import type { ReviewSubject } from '@/main/modules/observation-reviews/ObservationReviewService';

it('requires exact evidence and current projection; withdrawal and changed decisions invalidate a review', () => {
  const subject = { competitionId: 'competition', evidenceReference: 'observation:e1' } as ReviewSubject;
  const correction = {
    id: 'c1',
    basis: { competitionId: 'competition', resultScope: 'QUALIFICATION' },
    request: { changes: [{ evidenceReference: 'observation:e1' }] },
  } as unknown as ScoreCorrectionApplication;
  let withdrawn = false;
  const projection = { ids: ['c1'], issues: [] as string[] };
  const repository = {
    find: () => correction,
    withdrawal: () => (withdrawn ? {} : null),
  } as unknown as IScoreCorrectionRepository;
  const service = { workspace: () => ({ projection }) } as unknown as ScoreCorrectionService;
  const source = new AppliedReviewCorrections(repository, service, () => ['competition']);
  expect(source.issue(subject, 'c1')).toBeNull();
  expect(source.issue({ ...subject, competitionId: 'other' }, 'c1')).toMatch(/belong/);
  expect(source.issue({ ...subject, evidenceReference: 'observation:other' }, 'c1')).toMatch(/reference/);
  projection.issues.push('Jury decision revoked');
  expect(source.issue(subject, 'c1')).toMatch(/no longer current/);
  withdrawn = true;
  expect(source.issue(subject, 'c1')).toMatch(/withdrawn/);
});

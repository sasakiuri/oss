import { describe, expect, it, vi } from 'vitest';

import {
  FinalResultDeclaration,
  type IFinalResultDeclarationRepository,
  type IResultPublicationReadiness,
  type IResultPublicationRepository,
} from '@/main/modules/result-publication';
import { createOfficialPublishedEntry } from '@/main/modules/result-publication/domain/ResultPublicationEntry';
import {
  ResultWorkflowOfficialRevisionSource,
  VerifiedResultsBookResultSnapshotSource,
} from '@/main/modules/results-books';
import type { ResultVerificationStatusDto } from '@/shared/ipc/contracts';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const RESULT_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_ID = '33333333-3333-4333-8333-333333333333';
const APPROVAL_ID = '44444444-4444-4444-8444-444444444444';
const REVISION = 'a'.repeat(64);

describe('VerifiedResultsBookResultSnapshotSource', () => {
  it('preserves the projected score and independently reports the Official revision', async () => {
    const verification = {
      getStatus: vi.fn(
        async () =>
          ({
            eventId: EVENT_ID,
            resultScope: 'QUALIFICATION',
            snapshotRevision: 'b'.repeat(64),
            results: [
              {
                resultId: RESULT_ID,
                participantId: PARTICIPANT_ID,
                rank: 1,
                playerName: 'Athlete A',
                affiliation: 'Nation A',
                totalScore: 632.4,
                classificationCode: null,
                status: 'confirmed',
              },
            ],
          }) as ResultVerificationStatusDto,
      ),
    };
    const official = createOfficialPublishedEntry({
      eventId: EVENT_ID,
      resultScope: 'QUALIFICATION',
      preliminaryId: crypto.randomUUID(),
      snapshotRevision: REVISION,
      approvalId: APPROVAL_ID,
      officialName: 'RTS Officer',
      publishedAt: new Date('2026-09-02T06:00:00.000Z'),
    });
    const publications: IResultPublicationRepository = {
      append: vi.fn(),
      findByEvent: vi.fn(() => [official]),
    };
    const readiness: IResultPublicationReadiness = {
      getCurrent: vi.fn(async () => ({
        supported: true,
        resultCount: 1,
        snapshotRevision: 'b'.repeat(64),
        approvalId: APPROVAL_ID,
        approvalSnapshotRevision: 'b'.repeat(64),
        verificationIssues: ['Irregular shot case is unresolved'],
      })),
    };
    const declarations: IFinalResultDeclarationRepository = {
      append: vi.fn(),
      findByEvent: vi.fn(() => null),
    };

    const snapshot = await new VerifiedResultsBookResultSnapshotSource(
      verification,
      new ResultWorkflowOfficialRevisionSource(publications, declarations),
      readiness,
    ).load(EVENT_ID, 'QUALIFICATION');

    expect(snapshot).toMatchObject({
      eventId: EVENT_ID,
      resultScope: 'QUALIFICATION',
      snapshotRevision: 'b'.repeat(64),
      officialPublicationRevision: REVISION,
      publicationIssues: ['Irregular shot case is unresolved'],
      results: [{ resultId: RESULT_ID, totalScore: 632.4, rank: 1 }],
    });
  });

  it('uses the RESULTS ARE FINAL declaration as the Official Final revision', () => {
    const declaration = FinalResultDeclaration.create({
      eventId: EVENT_ID,
      snapshotRevision: REVISION,
      approvalId: APPROVAL_ID,
      finalProtestsResolved: true,
      resultProcessConfirmed: true,
      statement: 'RESULTS ARE FINAL',
      officialName: 'CRO',
    });
    const publications: IResultPublicationRepository = {
      append: vi.fn(),
      findByEvent: vi.fn(() => []),
    };
    const declarations: IFinalResultDeclarationRepository = {
      append: vi.fn(),
      findByEvent: vi.fn(() => declaration),
    };

    const source = new ResultWorkflowOfficialRevisionSource(publications, declarations);

    expect(source.findOfficial(EVENT_ID, 'FINAL')).toEqual({
      snapshotRevision: REVISION,
      approvalId: APPROVAL_ID,
    });
    expect(publications.findByEvent).not.toHaveBeenCalled();
  });
});

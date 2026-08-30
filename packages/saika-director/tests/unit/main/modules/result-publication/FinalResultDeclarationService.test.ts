import { describe, expect, it } from 'vitest';

import { FinalResultDeclarationService } from '@/main/modules/result-publication';
import type { IFinalResultDeclarationRepository } from '@/main/modules/result-publication';
import type { IResultPublicationReadiness, ResultPublicationReadiness } from '@/main/modules/result-publication';
import type { FinalResultDeclaration } from '@/main/modules/result-publication';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const APPROVAL_ID = '22222222-2222-4222-8222-222222222222';
const REVISION = 'a'.repeat(64);

describe('FinalResultDeclarationService', () => {
  it('requires a current RTS approval and explicit Final confirmations', async () => {
    let readiness: ResultPublicationReadiness = {
      supported: true,
      resultCount: 8,
      snapshotRevision: REVISION,
      approvalId: null,
      approvalSnapshotRevision: null,
      verificationIssues: ['A current approval is required'],
    };
    let stored: FinalResultDeclaration | null = null;
    const repository: IFinalResultDeclarationRepository = {
      append: (declaration) => {
        stored = declaration;
      },
      findByEvent: () => stored,
    };
    const readinessPort: IResultPublicationReadiness = { getCurrent: async () => readiness };
    const service = new FinalResultDeclarationService(repository, readinessPort);

    expect(await service.getStatus(EVENT_ID)).toMatchObject({ canDeclare: false, declaration: null });
    readiness = {
      ...readiness,
      approvalId: APPROVAL_ID,
      approvalSnapshotRevision: REVISION,
      verificationIssues: [],
    };
    expect(await service.getStatus(EVENT_ID)).toMatchObject({ canDeclare: true, issues: [] });

    await expect(
      service.declare({
        eventId: EVENT_ID,
        finalProtestsResolved: false,
        resultProcessConfirmed: true,
        statement: 'RESULTS ARE FINAL',
        officialName: 'CRO',
      }),
    ).rejects.toThrow('All immediate Final protests must be resolved');

    const declared = await service.declare({
      eventId: EVENT_ID,
      finalProtestsResolved: true,
      resultProcessConfirmed: true,
      statement: 'RESULTS ARE FINAL',
      officialName: 'CRO',
    });
    expect(declared).toMatchObject({ declarationCurrent: true, canDeclare: false, issues: [] });
    expect(declared.declaration).toMatchObject({
      approvalId: APPROVAL_ID,
      finalProtestsResolved: true,
      resultProcessConfirmed: true,
      officialName: 'CRO',
    });
  });

  it('preserves the declaration and reports a later result revision as stale', async () => {
    let revision = REVISION;
    let stored: FinalResultDeclaration | null = null;
    const repository: IFinalResultDeclarationRepository = {
      append: (declaration) => {
        stored = declaration;
      },
      findByEvent: () => stored,
    };
    const readiness: IResultPublicationReadiness = {
      getCurrent: async () => ({
        supported: true,
        resultCount: 8,
        snapshotRevision: revision,
        approvalId: APPROVAL_ID,
        approvalSnapshotRevision: revision,
        verificationIssues: [],
      }),
    };
    const service = new FinalResultDeclarationService(repository, readiness);
    await service.declare({
      eventId: EVENT_ID,
      finalProtestsResolved: true,
      resultProcessConfirmed: true,
      statement: 'RESULTS ARE FINAL',
      officialName: 'CRO',
    });

    revision = 'b'.repeat(64);
    const stale = await service.getStatus(EVENT_ID);

    expect(stale).toMatchObject({ declarationCurrent: false, canDeclare: false });
    expect(stale.issues).toContain('The current Final result list no longer matches the RESULTS ARE FINAL declaration');
    await expect(
      service.declare({
        eventId: EVENT_ID,
        finalProtestsResolved: true,
        resultProcessConfirmed: true,
        statement: 'RESULTS ARE FINAL',
        officialName: 'CRO',
      }),
    ).rejects.toThrow('event correction procedure');
  });
});

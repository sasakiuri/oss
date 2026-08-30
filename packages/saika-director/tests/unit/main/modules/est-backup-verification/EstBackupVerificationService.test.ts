import { describe, expect, it, vi } from 'vitest';

import { EstBackupVerificationService } from '@/main/modules/est-backup-verification';
import type { IEstBackupVerificationRepository } from '@/main/modules/est-backup-verification';
import type { IQualificationResultsReader } from '@/main/modules/results';
import type { EstBackupVerificationRunDto, TeamResultDto } from '@/shared/ipc/contracts';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const FAILED_RUN_ID = '22222222-2222-4222-8222-222222222222';
const VERIFIED_RUN_ID = '33333333-3333-4333-8333-333333333333';
const RETIED_RUN_ID = '44444444-4444-4444-8444-444444444444';

function teamResult(rank: number, totalScore: number, options: { decisionCount?: number } = {}): TeamResultDto {
  return {
    rank,
    teamId: `team-${rank}`,
    teamName: `Team ${rank}`,
    nationCode: `N${rank}`,
    eligible: true,
    totalScore,
    issues: [],
    unresolvedTie: false,
    ruleReferences: 'ISSF 6.14.8',
    tieEvidence: { innerTens: 10, seriesTotals: [totalScore], manualReviewRequired: !!options.decisionCount },
    members: [
      {
        participantId: `participant-${rank}-f`,
        playerName: `Female ${rank}`,
        familyName: `Female ${rank}`,
        nationCode: `N${rank}`,
        gender: 'F',
        entryStatus: 'COMPETING',
        totalScore: totalScore / 2,
        classificationCode: null,
        decisionCount: options.decisionCount ?? 0,
      },
      {
        participantId: `participant-${rank}-m`,
        playerName: `Male ${rank}`,
        familyName: `Male ${rank}`,
        nationCode: `N${rank}`,
        gender: 'M',
        entryStatus: 'COMPETING',
        totalScore: totalScore / 2,
        classificationCode: null,
        decisionCount: 0,
      },
    ],
  };
}

function harness() {
  const runs: EstBackupVerificationRunDto[] = [];
  let teams = [teamResult(1, 630, { decisionCount: 1 }), teamResult(2, 629), teamResult(3, 628)];
  const repository: IEstBackupVerificationRepository = {
    append: vi.fn((run) => runs.push(run)),
    findByEvent: vi.fn((eventId) => runs.filter((run) => run.eventId === eventId)),
  };
  const qualificationResults: IQualificationResultsReader = {
    getByEvent: vi.fn(async () => []),
    getByRelay: vi.fn(async () => []),
  };
  const teamResults = {
    getQualification: vi.fn(async () => teams),
  };
  const service = new EstBackupVerificationService(
    repository,
    { findByEventId: vi.fn(() => []) },
    qualificationResults,
    teamResults,
  );
  return {
    service,
    setTeams(next: TeamResultDto[]) {
      teams = next;
    },
  };
}

function matchingRecords(teams: readonly TeamResultDto[]) {
  return teams.map((team) => ({ key: team.teamId, rank: team.rank, totalScore: team.totalScore }));
}

describe('EstBackupVerificationService team readiness', () => {
  it('requires the latest current-snapshot comparison and manual-intervention review', async () => {
    const { service } = harness();
    const teams = [teamResult(1, 630, { decisionCount: 1 }), teamResult(2, 629), teamResult(3, 628)];

    const missing = await service.assess({
      eventId: EVENT_ID,
      resultKind: 'MIXED_TEAM',
      configuredChecks: 3,
      requireResults: true,
    });
    expect(missing).toMatchObject({ requiredChecks: 3, checkedResults: 0, currentVerificationId: null });
    expect(missing.issues).toContain(
      'Required team results need a current EST printout or independent-memory comparison',
    );

    const failed = await service.verify({
      id: FAILED_RUN_ID,
      eventId: EVENT_ID,
      resultKind: 'MIXED_TEAM',
      keyType: 'TEAM_ID',
      sourceName: 'Independent EST memory',
      records: matchingRecords(teams),
      officialName: 'RTS Jury A',
    });
    expect(failed.verified).toBe(false);
    expect((await service.assess({ ...missingRequest(), requireResults: true })).issues).toContain(
      'The latest EST printout or independent-memory comparison for the current team results is not verified',
    );

    const verified = await service.verify({
      id: VERIFIED_RUN_ID,
      eventId: EVENT_ID,
      resultKind: 'MIXED_TEAM',
      keyType: 'TEAM_ID',
      sourceName: 'Independent EST memory',
      records: matchingRecords(teams),
      interventionReviewStatement: 'Reviewed the one scoring intervention against the independent record.',
      officialName: 'RTS Jury B',
    });
    const ready = await service.assess({ ...missingRequest(), requireResults: true });

    expect(verified.verified).toBe(true);
    expect(ready).toMatchObject({
      supported: true,
      requiredChecks: 3,
      checkedResults: 3,
      currentVerificationId: VERIFIED_RUN_ID,
      issues: [],
    });
  });

  it('rejects stale comparisons and keeps an unresolved team tie as a separate blocker', async () => {
    const { service, setTeams } = harness();
    const initial = [teamResult(1, 630, { decisionCount: 1 }), teamResult(2, 629), teamResult(3, 628)];
    await service.verify({
      id: VERIFIED_RUN_ID,
      eventId: EVENT_ID,
      resultKind: 'MIXED_TEAM',
      keyType: 'TEAM_ID',
      sourceName: 'Independent EST memory',
      records: matchingRecords(initial),
      interventionReviewStatement: 'Reviewed.',
      officialName: 'RTS Jury A',
    });

    const changed = [teamResult(1, 631), teamResult(2, 629), teamResult(3, 628)];
    setTeams(changed);
    const stale = await service.assess(missingRequest());
    expect(stale.currentVerificationId).toBeNull();
    expect(stale.issues).toContain(
      'Required team results need a current EST printout or independent-memory comparison',
    );

    const tied = [{ ...changed[0]!, unresolvedTie: true }, changed[1]!, changed[2]!];
    setTeams(tied);
    await service.verify({
      id: RETIED_RUN_ID,
      eventId: EVENT_ID,
      resultKind: 'MIXED_TEAM',
      keyType: 'TEAM_ID',
      sourceName: 'Independent EST memory',
      records: matchingRecords(tied),
      officialName: 'RTS Jury B',
    });
    const blocked = await service.assess(missingRequest());

    expect(blocked.currentVerificationId).toBe(RETIED_RUN_ID);
    expect(blocked.issues).toContain('A required team result has an unresolved ranking tie');
  });

  it('requires a Mixed Team result but does not block an individual event with no published teams', async () => {
    const { service, setTeams } = harness();
    setTeams([]);

    const mixed = await service.assess(missingRequest());
    const individual = await service.assess({ ...missingRequest(), resultKind: 'TEAM', requireResults: false });

    expect(mixed.issues).toContain('No eligible Mixed Team results are available for verification');
    expect(individual).toMatchObject({ requiredChecks: 0, checkedResults: 0, issues: [] });
  });
});

function missingRequest() {
  return {
    eventId: EVENT_ID,
    resultKind: 'MIXED_TEAM' as const,
    configuredChecks: 3,
    requireResults: true,
  };
}

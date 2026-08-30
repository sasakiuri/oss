import { describe, expect, it } from 'vitest';
import { IssfProductionOperationPolicy } from '@/main/modules/production-operations/domain/ProductionOperationPolicy';
import type { ProductionOperationEntry } from '@/main/modules/production-operations/domain/IProductionOperationRepository';

function entry(action: ProductionOperationEntry['action']): ProductionOperationEntry {
  return {
    id: crypto.randomUUID(),
    competitionId: '11111111-1111-4111-8111-111111111111',
    competitionTypeId: 'ARMIX_FINAL',
    roundName: 'Final',
    phase: 'MATCH',
    action,
    statement: 'checked',
    officialName: 'Official',
    recordedAt: new Date().toISOString(),
  };
}

describe('IssfProductionOperationPolicy', () => {
  it('advises music, programme approval and complete production during a Final', () => {
    const policy = new IssfProductionOperationPolicy();
    expect(
      policy.assess({ competitionTypeId: 'ARMIX_FINAL', roundName: 'Final', phase: 'MATCH', entries: [] }),
    ).toMatchObject({ mode: 'ADVISORY', musicRequired: true, ready: false, mayProceed: true });

    expect(
      policy.assess({
        competitionTypeId: 'ARMIX_FINAL',
        roundName: 'Final',
        phase: 'MATCH',
        entries: [entry('MUSIC_PROGRAM_APPROVED'), entry('FINAL_PRODUCTION_CONFIRMED'), entry('MUSIC_STARTED')],
      }),
    ).toMatchObject({ musicPlaying: true, musicProgramApproved: true, finalProductionConfirmed: true, ready: true });
  });

  it('tracks stop and revocation entries by append order', () => {
    const policy = new IssfProductionOperationPolicy('REQUIRED');
    const assessment = policy.assess({
      competitionTypeId: 'AR60_FINAL',
      roundName: 'Final',
      phase: 'MATCH',
      entries: [
        entry('MUSIC_STARTED'),
        entry('MUSIC_STOPPED'),
        entry('MUSIC_PROGRAM_APPROVED'),
        entry('MUSIC_PROGRAM_APPROVAL_REVOKED'),
      ],
    });
    expect(assessment).toMatchObject({
      musicPlaying: false,
      musicProgramApproved: false,
      ready: false,
      mayProceed: false,
    });
  });
});

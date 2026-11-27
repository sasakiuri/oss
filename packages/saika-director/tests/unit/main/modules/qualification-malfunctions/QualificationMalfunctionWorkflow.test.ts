// SPDX-License-Identifier: MIT
import {
  ISSF_2026_AR60,
  ISSF_2026_P25,
  ISSF_2026_RFPM,
  ISSF_2026_STDP,
  type QualificationMalfunctionCapability,
} from '@sasakiuri/saika-rules';
import { describe, expect, it } from 'vitest';

import {
  QualificationMalfunctionCase,
  QualificationMalfunctionEntry,
  type QualificationMalfunctionStatus,
} from '@/main/modules/qualification-malfunctions/domain/QualificationMalfunctionCase';
import {
  assertExceptionalPartSupported,
  assertQualificationMalfunctionPolicyEntry,
  assertQualificationMalfunctionTransition,
  assertSignalPolicyContext,
  defaultQualificationMalfunctionRuleReference,
} from '@/main/modules/qualification-malfunctions/domain/QualificationMalfunctionWorkflow';
import type { AppendQualificationMalfunctionEntryPayload } from '@/shared/ipc/contracts';

const CASE_ID = '11111111-1111-4111-8111-111111111111';

const AR60_POLICY = ISSF_2026_AR60.capabilities.qualificationMalfunction!;
const P25_POLICY = ISSF_2026_P25.capabilities.qualificationMalfunction!;
const RFPM_POLICY = ISSF_2026_RFPM.capabilities.qualificationMalfunction!;
const STDP_POLICY = ISSF_2026_STDP.capabilities.qualificationMalfunction!;

function malfunctionCase(
  policySnapshot: QualificationMalfunctionCapability,
  overrides: Partial<Parameters<typeof QualificationMalfunctionCase.create>[0]> = {},
): QualificationMalfunctionCase {
  return QualificationMalfunctionCase.create({
    id: CASE_ID,
    competitionId: '22222222-2222-4222-8222-222222222222',
    eventId: '33333333-3333-4333-8333-333333333333',
    competitionTypeId: 'P25',
    policySnapshot,
    participantId: '44444444-4444-4444-8444-444444444444',
    participantNameSnapshot: 'Athlete One',
    laneId: '55555555-5555-4555-8555-555555555555',
    laneChannelSnapshot: 1,
    relayNumberSnapshot: 1,
    reportSource: 'DIRECTOR_MANUAL',
    claimMode: 'CLAIM',
    phase: 'MATCH',
    stageId: 'PRECISION_STAGE',
    stageIndex: 1,
    seriesIndex: 0,
    seriesShotLimit: 5,
    recordedShots: 2,
    existingClaimsInScope: 0,
    claimAssessment: { allowed: true, maximumInScope: 1, maximumInExceptionalPart: null, reason: 'AVAILABLE' },
    summary: 'Pistol failed during the series',
    openedBy: 'Range Officer',
    ...overrides,
  });
}

function classified(classification: 'ALLOWABLE' | 'NON_ALLOWABLE', causeCode: string) {
  return QualificationMalfunctionEntry.create({
    caseId: CASE_ID,
    type: 'CLASSIFIED',
    statement: 'Classified after inspection',
    officialName: 'Range Officer',
    officialRole: 'RANGE_OFFICER',
    classification,
    causeCode,
  });
}

const ALLOWABLE = [classified('ALLOWABLE', 'PROJECTILE_LODGED')];
const NON_ALLOWABLE = [classified('NON_ALLOWABLE', 'SAFETY_NOT_RELEASED')];

function entry(
  type: AppendQualificationMalfunctionEntryPayload['type'],
  fields: Partial<AppendQualificationMalfunctionEntryPayload> = {},
): AppendQualificationMalfunctionEntryPayload {
  return {
    caseId: CASE_ID,
    type,
    statement: `${type} statement`,
    officialName: 'Official',
    officialRole: 'RANGE_OFFICER',
    ...fields,
  };
}

describe('assertSignalPolicyContext', () => {
  const policy = {
    competitionTypeId: 'RFPM',
    rulePackIdentity: null,
    capability: RFPM_POLICY,
    phase: 'MATCH' as const,
    stageId: 'STAGE_1',
    stageIndex: 1,
    seriesIndex: 0,
    seriesShotLimit: 5,
    timedTargetProgramId: 'RFPM_MATCH_8',
  };
  const signal = {
    signalId: 'signal-1',
    laneId: 'lane-1',
    status: 'ACTIVE' as const,
    competitionId: 'competition-1',
    sessionId: 'session-1',
    participantId: 'participant-1',
    participantName: 'Athlete One',
    startNumber: null,
    phase: 'MATCH' as const,
    stageIndex: 1,
    seriesIndex: 0,
    seriesShotLimit: 5,
    recordedShots: 1,
    timedTargetProgramId: 'RFPM_MATCH_8',
    exposureIndex: 0,
    message: null,
    signalledAt: new Date('2026-11-28T00:00:00.000Z'),
  };

  it('accepts a Lane declaration that matches the event Rule Pack context', () => {
    expect(() => assertSignalPolicyContext(signal, policy)).not.toThrow();
  });

  it.each([
    ['phase', { phase: 'SIGHTING' as const }],
    ['series shot limit', { seriesShotLimit: null }],
    ['timed-target program', { timedTargetProgramId: 'RFPM_MATCH_6' }],
  ])('rejects a Lane declaration whose %s differs from the Rule Pack', (_label, change) => {
    expect(() => assertSignalPolicyContext({ ...signal, ...change }, policy)).toThrow(
      'Lane declaration context does not match the event Rule Pack',
    );
  });
});

describe('assertExceptionalPartSupported', () => {
  it('accepts a missing part and a part of a policy with exceptional two-part limits', () => {
    expect(() => assertExceptionalPartSupported(P25_POLICY, undefined)).not.toThrow();
    expect(() => assertExceptionalPartSupported(STDP_POLICY, 2)).not.toThrow();
  });

  it('rejects an exceptional part for a policy without two-part claim limits', () => {
    expect(() => assertExceptionalPartSupported(P25_POLICY, 1)).toThrow(
      'This malfunction policy does not support exceptional two-part claim limits',
    );
    expect(() => assertExceptionalPartSupported(AR60_POLICY, 2)).toThrow('does not support exceptional two-part');
  });
});

describe('assertQualificationMalfunctionTransition', () => {
  it('rejects every change to a void case', () => {
    expect(() => assertQualificationMalfunctionTransition('VOID', 'NOTE')).toThrow(
      'A void qualification malfunction case cannot be changed',
    );
  });

  it.each<QualificationMalfunctionStatus>(['OPEN', 'REPAIRING', 'COMPLETED'])(
    'accepts notes and void corrections in status %s',
    (status) => {
      expect(() => assertQualificationMalfunctionTransition(status, 'NOTE')).not.toThrow();
      expect(() => assertQualificationMalfunctionTransition(status, 'VOID')).not.toThrow();
    },
  );

  it('reopens only settled or completed scoring', () => {
    expect(() => assertQualificationMalfunctionTransition('SETTLED', 'SCORE_REOPENED')).not.toThrow();
    expect(() => assertQualificationMalfunctionTransition('COMPLETED', 'SCORE_REOPENED')).not.toThrow();
    expect(() => assertQualificationMalfunctionTransition('EXECUTED', 'SCORE_REOPENED')).toThrow(
      'Only settled scoring may be reopened',
    );
  });

  it('accepts only notes, void corrections and reopening after completion', () => {
    expect(() => assertQualificationMalfunctionTransition('COMPLETED', 'INSPECTION_RECORDED')).toThrow(
      'A completed qualification malfunction case only accepts notes or a void correction',
    );
  });

  it.each<[QualificationMalfunctionStatus, AppendQualificationMalfunctionEntryPayload['type']]>([
    ['OPEN', 'INSPECTION_RECORDED'],
    ['INSPECTED', 'INSPECTION_RECORDED'],
    ['INSPECTED', 'CLASSIFIED'],
    ['CLASSIFIED', 'CLASSIFIED'],
    ['CLASSIFIED', 'REPAIR_STARTED'],
    ['REPAIRING', 'REPAIR_EXTENDED'],
    ['REPAIRING', 'REPAIR_COMPLETED'],
    ['CLASSIFIED', 'REMEDY_AUTHORIZED'],
    ['REPAIRED', 'REMEDY_AUTHORIZED'],
    ['RECOVERY_AUTHORIZED', 'REMEDY_AUTHORIZED'],
    ['RECOVERY_AUTHORIZED', 'EXECUTION_RECORDED'],
    ['EXECUTED', 'SCORE_SETTLED'],
    ['SETTLED', 'COMPLETED'],
  ])('allows %s -> %s', (status, next) => {
    expect(() => assertQualificationMalfunctionTransition(status, next)).not.toThrow();
  });

  it.each<[QualificationMalfunctionStatus, AppendQualificationMalfunctionEntryPayload['type'], string]>([
    ['CLASSIFIED', 'INSPECTION_RECORDED', 'Inspection must be recorded before classification'],
    ['OPEN', 'CLASSIFIED', 'Classification requires a recorded inspection'],
    ['INSPECTED', 'REPAIR_STARTED', 'Repair may start only after classification'],
    ['REPAIRED', 'REPAIR_EXTENDED', 'Only an active repair may be extended'],
    ['CLASSIFIED', 'REPAIR_COMPLETED', 'Only an active repair may be completed'],
    ['INSPECTED', 'REMEDY_AUTHORIZED', 'Classification is required before authorizing a remedy'],
    ['CLASSIFIED', 'EXECUTION_RECORDED', 'A remedy must be authorized before recording execution'],
    ['RECOVERY_AUTHORIZED', 'SCORE_SETTLED', 'Recovery execution must be recorded before score settlement'],
    ['EXECUTED', 'COMPLETED', 'Score settlement is required before completing the case'],
  ])('rejects %s -> %s', (status, next, message) => {
    expect(() => assertQualificationMalfunctionTransition(status, next)).toThrow(message);
  });
});

describe('assertQualificationMalfunctionPolicyEntry', () => {
  it('requires the cause code and classification to match the policy snapshot', () => {
    const value = malfunctionCase(P25_POLICY);

    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        value,
        [],
        entry('CLASSIFIED', { classification: 'NON_ALLOWABLE', causeCode: 'PROJECTILE_LODGED' }),
      ),
    ).toThrow('Cause code and malfunction classification must match the policy snapshot');
    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        value,
        [],
        entry('CLASSIFIED', { classification: 'ALLOWABLE', causeCode: 'UNKNOWN_CAUSE' }),
      ),
    ).toThrow('must match the policy snapshot');
  });

  it('limits Range Officer determinations to range officials', () => {
    const value = malfunctionCase(P25_POLICY);
    const classification = { classification: 'ALLOWABLE' as const, causeCode: 'PROJECTILE_LODGED' };

    expect(() =>
      assertQualificationMalfunctionPolicyEntry(value, [], entry('CLASSIFIED', classification)),
    ).not.toThrow();
    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        value,
        [],
        entry('CLASSIFIED', { ...classification, officialRole: 'JURY_MEMBER' }),
      ),
    ).toThrow('The selected official role may not determine this malfunction');
  });

  it('lets a Jury member determine a malfunction under a range-or-jury policy', () => {
    const value = malfunctionCase(AR60_POLICY, { stageId: 'MATCH', recordedShots: 0, seriesShotLimit: 10 });

    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        value,
        [],
        entry('CLASSIFIED', {
          classification: 'ALLOWABLE',
          causeCode: 'CARTRIDGE_FAILED_TO_FIRE',
          officialRole: 'JURY_MEMBER',
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        value,
        [],
        entry('CLASSIFIED', {
          classification: 'ALLOWABLE',
          causeCode: 'CARTRIDGE_FAILED_TO_FIRE',
          officialRole: 'TECHNICAL_OFFICER',
        }),
      ),
    ).toThrow('may not determine this malfunction');
  });

  it('admits only allowable malfunctions to repair', () => {
    const value = malfunctionCase(P25_POLICY);

    expect(() => assertQualificationMalfunctionPolicyEntry(value, ALLOWABLE, entry('REPAIR_STARTED'))).not.toThrow();
    expect(() => assertQualificationMalfunctionPolicyEntry(value, NON_ALLOWABLE, entry('REPAIR_STARTED'))).toThrow(
      'Only an allowable malfunction may enter the repair workflow',
    );
  });

  it('lets only a Jury member extend a repair under a policy that permits extension', () => {
    const extension = { repairSeconds: 300 };

    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        malfunctionCase(P25_POLICY),
        ALLOWABLE,
        entry('REPAIR_EXTENDED', { ...extension, officialRole: 'JURY_MEMBER' }),
      ),
    ).not.toThrow();
    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        malfunctionCase(P25_POLICY),
        ALLOWABLE,
        entry('REPAIR_EXTENDED', { ...extension, officialRole: 'CRO' }),
      ),
    ).toThrow('Only a Jury member may extend the repair period');
    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        malfunctionCase(AR60_POLICY, { stageId: 'MATCH' }),
        ALLOWABLE,
        entry('REPAIR_EXTENDED', { ...extension, officialRole: 'JURY_MEMBER' }),
      ),
    ).toThrow('This malfunction repair period may not be extended');
  });

  it('requires a classification before a remedy', () => {
    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        malfunctionCase(P25_POLICY),
        [],
        entry('REMEDY_AUTHORIZED', { remedy: 'COMPLETE_REMAINING_SHOTS', shotsToFire: 3 }),
      ),
    ).toThrow('A remedy requires a malfunction classification');
  });

  it.each([
    [
      'documentation-only cases',
      () =>
        malfunctionCase(P25_POLICY, {
          claimMode: 'DOCUMENTATION_ONLY',
          claimAssessment: {
            allowed: false,
            maximumInScope: 1,
            maximumInExceptionalPart: null,
            reason: 'SCOPE_LIMIT_REACHED',
          },
        }),
      ALLOWABLE,
      { remedy: 'NO_FURTHER_ACTION' as const, shotsToFire: 0 },
    ],
    [
      'non-allowable malfunctions',
      () => malfunctionCase(P25_POLICY),
      NON_ALLOWABLE,
      { remedy: 'SCORE_UNFIRED_AS_MISS' as const, shotsToFire: 0 },
    ],
    [
      'sighting malfunctions',
      () =>
        malfunctionCase(AR60_POLICY, {
          phase: 'SIGHTING',
          stageId: 'PREPARATION_AND_SIGHTING',
          stageIndex: 0,
          seriesShotLimit: null,
          recordedShots: 0,
        }),
      [classified('ALLOWABLE', 'CARTRIDGE_FAILED_TO_FIRE')],
      { remedy: 'CONTINUE_WITHIN_ORIGINAL_TIME' as const, shotsToFire: 0 },
    ],
    [
      'stages that continue within the original time',
      () => malfunctionCase(AR60_POLICY, { stageId: 'MATCH', seriesShotLimit: 10 }),
      [classified('ALLOWABLE', 'CARTRIDGE_FAILED_TO_FIRE')],
      { remedy: 'CONTINUE_WITHIN_ORIGINAL_TIME' as const, shotsToFire: 0 },
    ],
    [
      'stages that repeat the full series',
      () => malfunctionCase(RFPM_POLICY, { stageId: 'STAGE_1', recordedShots: 3 }),
      ALLOWABLE,
      { remedy: 'REPEAT_FULL_SERIES' as const, shotsToFire: 5 },
    ],
    [
      'stages that complete the remaining shots',
      () => malfunctionCase(P25_POLICY, { recordedShots: 2 }),
      ALLOWABLE,
      { remedy: 'COMPLETE_REMAINING_SHOTS' as const, shotsToFire: 3 },
    ],
  ])('authorizes the policy remedy for %s and rejects any other', (_label, build, entries, expected) => {
    const value = build();

    expect(() =>
      assertQualificationMalfunctionPolicyEntry(value, entries, entry('REMEDY_AUTHORIZED', expected)),
    ).not.toThrow();
    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        value,
        entries,
        entry('REMEDY_AUTHORIZED', { ...expected, shotsToFire: expected.shotsToFire + 1 }),
      ),
    ).toThrow(`The policy requires ${expected.remedy} with ${expected.shotsToFire} shots to fire`);
  });

  it('rejects a remedy when the policy snapshot has no treatment for the stage', () => {
    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        malfunctionCase(P25_POLICY, { stageId: 'UNKNOWN_STAGE', stageIndex: 3 }),
        ALLOWABLE,
        entry('REMEDY_AUTHORIZED', { remedy: 'COMPLETE_REMAINING_SHOTS', shotsToFire: 3 }),
      ),
    ).toThrow('Policy snapshot has no treatment for stage UNKNOWN_STAGE');
    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        malfunctionCase(P25_POLICY, { stageId: null, stageIndex: 3 }),
        ALLOWABLE,
        entry('REMEDY_AUTHORIZED', { remedy: 'COMPLETE_REMAINING_SHOTS', shotsToFire: 3 }),
      ),
    ).toThrow('Policy snapshot has no treatment for stage 3');
  });

  it('requires a finite series shot limit to complete the remaining shots', () => {
    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        malfunctionCase(P25_POLICY, { seriesShotLimit: null }),
        ALLOWABLE,
        entry('REMEDY_AUTHORIZED', { remedy: 'COMPLETE_REMAINING_SHOTS', shotsToFire: 3 }),
      ),
    ).toThrow('Completion treatment requires a finite series shot limit');
  });

  it.each(['EXECUTION_RECORDED', 'SCORE_SETTLED', 'SCORE_REOPENED'] as const)(
    'requires an immutable artifact for %s',
    (type) => {
      expect(() =>
        assertQualificationMalfunctionPolicyEntry(
          malfunctionCase(P25_POLICY),
          ALLOWABLE,
          entry(type, { officialRole: 'RTS_OFFICER' }),
        ),
      ).toThrow(`${type} requires an immutable artifact reference`);
    },
  );

  it.each(['SCORE_SETTLED', 'SCORE_REOPENED'] as const)('lets only RTS or a Jury member record %s', (type) => {
    const value = malfunctionCase(P25_POLICY);
    const artifact = { artifactId: 'score-sheet-1' };

    expect(() =>
      assertQualificationMalfunctionPolicyEntry(value, ALLOWABLE, entry(type, { ...artifact, officialRole: 'CRO' })),
    ).toThrow('Score settlement must be recorded by RTS or a Jury member');
    expect(() =>
      assertQualificationMalfunctionPolicyEntry(
        value,
        ALLOWABLE,
        entry(type, { ...artifact, officialRole: 'JURY_MEMBER' }),
      ),
    ).not.toThrow();
  });
});

describe('defaultQualificationMalfunctionRuleReference', () => {
  const value = malfunctionCase(P25_POLICY);

  it('keeps an explicit rule reference', () => {
    expect(defaultQualificationMalfunctionRuleReference(value, entry('NOTE', { ruleReference: '6.13.8' }))).toBe(
      '6.13.8',
    );
  });

  it('derives the reference from the cause, the remedy treatment or the repair policy', () => {
    expect(
      defaultQualificationMalfunctionRuleReference(
        value,
        entry('CLASSIFIED', { classification: 'NON_ALLOWABLE', causeCode: 'SAFETY_NOT_RELEASED' }),
      ),
    ).toBe('8.9.4.2(b)');
    expect(
      defaultQualificationMalfunctionRuleReference(
        value,
        entry('REMEDY_AUTHORIZED', { remedy: 'SCORE_UNFIRED_AS_MISS', shotsToFire: 0 }),
      ),
    ).toBe('8.9.4.4');
    expect(
      defaultQualificationMalfunctionRuleReference(
        value,
        entry('REMEDY_AUTHORIZED', { remedy: 'COMPLETE_REMAINING_SHOTS', shotsToFire: 3 }),
      ),
    ).toBe('8.9.4.6');
    expect(defaultQualificationMalfunctionRuleReference(value, entry('REPAIR_STARTED'))).toBe('6.13.3, 8.9.2');
    expect(defaultQualificationMalfunctionRuleReference(value, entry('INSPECTION_RECORDED'))).toBeUndefined();
  });
});

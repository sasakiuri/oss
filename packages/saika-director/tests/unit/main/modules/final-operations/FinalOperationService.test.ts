import {
  ISSF_2026_ARMIX_FINAL,
  ISSF_2026_AR60_FINAL,
  ISSF_2026_P25_FINAL,
  ISSF_2026_RFPM_FINAL,
  RulePackRegistry,
} from '@sasakiuri/saika-rules';
import { describe, expect, it } from 'vitest';

import {
  FinalOperationService,
  type FinalOperationEntry,
  type FinalOperationRun,
  type FinalOperationShootOffShot,
  type IFinalOperationRepository,
} from '@/main/modules/final-operations';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';

const competitionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const commandId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const laneA = '11111111-1111-4111-8111-111111111111';
const laneB = '22222222-2222-4222-8222-222222222222';
const laneC = '33333333-3333-4333-8333-333333333333';
const laneD = '44444444-4444-4444-8444-444444444444';

class MemoryRepository implements IFinalOperationRepository {
  readonly runs: FinalOperationRun[] = [];
  readonly entries: FinalOperationEntry[] = [];
  readonly shootOffShots: FinalOperationShootOffShot[] = [];

  insertRun(run: FinalOperationRun): void {
    this.runs.push(run);
  }

  appendEntry(entry: FinalOperationEntry): void {
    this.entries.push(entry);
  }

  findRunById(id: string): FinalOperationRun | null {
    return this.runs.find((run) => run.id === id) ?? null;
  }

  findLatestRunByCompetition(targetCompetitionId: string): FinalOperationRun | null {
    return [...this.runs].reverse().find((run) => run.competitionId === targetCompetitionId) ?? null;
  }

  findEntriesByRun(runId: string): FinalOperationEntry[] {
    return this.entries.filter((entry) => entry.runId === runId);
  }

  appendShootOffShot(shot: FinalOperationShootOffShot): void {
    if (this.shootOffShots.some((entry) => entry.shotId === shot.shotId)) return;
    this.shootOffShots.push(shot);
  }

  findShootOffShotsByRun(runId: string): FinalOperationShootOffShot[] {
    return this.shootOffShots.filter((shot) => shot.runId === runId);
  }
}

function createService() {
  const competitionTypes = new CompetitionTypeRegistry();
  competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_AR60_FINAL));
  const repository = new MemoryRepository();
  return {
    service: new FinalOperationService(repository, competitionTypes, new RulePackRegistry([ISSF_2026_AR60_FINAL])),
    repository,
  };
}

function createMixedTeamService() {
  const competitionTypes = new CompetitionTypeRegistry();
  competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_ARMIX_FINAL));
  const repository = new MemoryRepository();
  return {
    service: new FinalOperationService(repository, competitionTypes, new RulePackRegistry([ISSF_2026_ARMIX_FINAL])),
    repository,
  };
}

function create25mService(pack: typeof ISSF_2026_P25_FINAL | typeof ISSF_2026_RFPM_FINAL) {
  const competitionTypes = new CompetitionTypeRegistry();
  competitionTypes.register(competitionTypeFromRulePack(pack));
  const repository = new MemoryRepository();
  return {
    service: new FinalOperationService(repository, competitionTypes, new RulePackRegistry([pack])),
    repository,
  };
}

describe('FinalOperationService', () => {
  it('persists the exact officially selected firing group for a Rapid Fire Final step', () => {
    const { service } = create25mService(ISSF_2026_RFPM_FINAL);
    let run = service.create({
      competitionId,
      competitionTypeId: 'RFPM_FINAL',
      scheduledStartAt: '2026-09-02T03:00:00.000Z',
      officialName: 'CRO A',
    });
    while (
      run.currentStep?.step.effect.type !== 'RUN_TIMED_TARGET' ||
      run.currentStep.step.effect.participantSelection !== 'OFFICIAL_SELECTED'
    ) {
      const confirmed = service.confirmStep({
        runId: run.id,
        stepId: run.currentStep!.step.id,
        officialName: 'CRO A',
      });
      run = service.recordExecution({
        runId: run.id,
        confirmationEntryId: confirmed.currentStep!.confirmationEntryId!,
        status: 'DONE',
        statement: 'Completed',
        officialName: 'CRO A',
      });
    }

    expect(() =>
      service.confirmStep({
        runId: run.id,
        stepId: run.currentStep!.step.id,
        eligibleLaneIds: [laneA],
        officialName: 'CRO A',
      }),
    ).toThrow('requires exactly 2');

    const confirmed = service.confirmStep({
      runId: run.id,
      stepId: run.currentStep.step.id,
      eligibleLaneIds: [laneA, laneB],
      officialName: 'CRO A',
    });
    expect(confirmed.currentStep?.eligibleLaneIds).toEqual([laneA, laneB]);

    run = service.recordExecution({
      runId: run.id,
      confirmationEntryId: confirmed.currentStep!.confirmationEntryId!,
      status: 'DONE',
      statement: 'First group completed',
      officialName: 'CRO A',
    });
    while (
      run.currentStep?.step.effect.type !== 'RUN_TIMED_TARGET' ||
      run.currentStep.step.effect.participantSelection !== 'OFFICIAL_SELECTED'
    ) {
      const nextConfirmation = service.confirmStep({
        runId: run.id,
        stepId: run.currentStep!.step.id,
        officialName: 'CRO A',
      });
      run = service.recordExecution({
        runId: run.id,
        confirmationEntryId: nextConfirmation.currentStep!.confirmationEntryId!,
        status: 'DONE',
        statement: 'Completed',
        officialName: 'CRO A',
      });
    }

    expect(() =>
      service.confirmStep({
        runId: run.id,
        stepId: run.currentStep!.step.id,
        eligibleLaneIds: [laneA, laneC],
        officialName: 'CRO A',
      }),
    ).toThrow('already fired in this series group');
    expect(() =>
      service.confirmStep({
        runId: run.id,
        stepId: run.currentStep!.step.id,
        eligibleLaneIds: [laneC, laneD],
        officialName: 'CRO A',
      }),
    ).not.toThrow();
  });

  it('keeps a confirmed step pending until its execution succeeds', () => {
    const { service } = createService();
    const run = service.create({
      competitionId,
      competitionTypeId: 'AR60_FINAL',
      scheduledStartAt: '2026-09-02T03:00:00.000Z',
      officialName: 'CRO A',
    });
    expect(run.currentStep?.step.id).toContain('reporting');
    expect(run.currentStep?.scheduledFor).toBe('2026-09-02T02:30:00.000Z');
    expect(() =>
      service.confirmStep({
        runId: run.id,
        stepId: run.currentStep!.step.id,
        eligibleLaneIds: [laneA, laneB],
        officialName: 'CRO A',
      }),
    ).toThrow('cannot be restricted');

    const confirmed = service.confirmStep({
      runId: run.id,
      stepId: run.currentStep!.step.id,
      officialName: 'CRO A',
    });
    expect(confirmed.currentStep?.status).toBe('AWAITING_EXECUTION');
    const confirmationEntryId = confirmed.currentStep!.confirmationEntryId!;
    const authorizedExecution = {
      competitionId,
      runId: run.id,
      confirmationEntryId,
      branch: 'MAIN' as const,
      iteration: 0,
      step: confirmed.currentStep!.step,
      eligibleLaneIds: [] as string[],
    };
    expect(() => service.assertExecutionAuthorized(authorizedExecution)).not.toThrow();
    expect(() =>
      service.assertExecutionAuthorized({
        ...authorizedExecution,
        competitionId: '99999999-9999-4999-8999-999999999999',
      }),
    ).toThrow('does not belong to competition');
    expect(() => service.assertExecutionAuthorized({ ...authorizedExecution, branch: 'SHOOT_OFF' })).toThrow(
      'branch or iteration does not match',
    );
    expect(() =>
      service.assertExecutionAuthorized({
        ...authorizedExecution,
        step: { ...authorizedExecution.step, text: 'START' },
      }),
    ).toThrow('does not match the confirmed snapshot');
    expect(() =>
      service.assertExecutionAuthorized({
        ...authorizedExecution,
        eligibleLaneIds: [laneA],
      }),
    ).toThrow('target Lanes do not match');

    const failed = service.recordExecution({
      runId: run.id,
      confirmationEntryId,
      status: 'ERROR',
      commandId,
      statement: 'Lane cue publish failed',
      officialName: 'CRO A',
    });
    expect(failed.currentStep?.status).toBe('AWAITING_EXECUTION');

    const completed = service.recordExecution({
      runId: run.id,
      confirmationEntryId,
      status: 'DONE',
      commandId,
      statement: 'Lane cue published',
      officialName: 'CRO A',
    });
    expect(completed.currentStep?.step.id).toContain('athletes-to-line');
  });

  it('allows a reasoned check skip but never skips an operational command', () => {
    const { service } = createService();
    const run = service.create({
      competitionId,
      competitionTypeId: 'AR60_FINAL',
      scheduledStartAt: '2026-09-02T03:00:00.000Z',
      officialName: 'CRO A',
    });
    const afterSkip = service.skipStep({
      runId: run.id,
      stepId: run.currentStep!.step.id,
      reason: 'Reporting was recorded by the preparation-area checklist.',
      officialName: 'CRO A',
    });
    expect(afterSkip.currentStep?.step.id).toContain('athletes-to-line');
    expect(() =>
      service.skipStep({
        runId: run.id,
        stepId: afterSkip.currentStep!.step.id,
        reason: 'Do not skip commands.',
        officialName: 'CRO A',
      }),
    ).toThrow('cannot be skipped');
  });

  it('runs a repeatable shoot-off branch at a checkpoint and closes it from observed shots', () => {
    const { service } = createService();
    let run = service.create({
      competitionId,
      competitionTypeId: 'AR60_FINAL',
      scheduledStartAt: '2026-09-02T03:00:00.000Z',
      officialName: 'CRO A',
    });
    while (run.currentStep?.step.effect.type !== 'CHECKPOINT') {
      const confirmed = service.confirmStep({
        runId: run.id,
        stepId: run.currentStep!.step.id,
        officialName: 'CRO A',
      });
      run = service.recordExecution({
        runId: run.id,
        confirmationEntryId: confirmed.currentStep!.confirmationEntryId!,
        status: 'DONE',
        statement: 'Completed',
        officialName: 'CRO A',
      });
    }

    run = service.startShootOff({
      runId: run.id,
      checkpointStepId: run.currentStep.step.id,
      eligibleLaneIds: [laneA, laneB],
      reason: 'Lowest totals are tied.',
      officialName: 'Jury A',
    });
    expect(run.currentBranch).toBe('SHOOT_OFF');
    expect(run.shootOff).toMatchObject({ iteration: 1, status: 'ACTIVE', eligibleLaneIds: [laneA, laneB] });
    expect(() =>
      service.observeShootOffShot({
        runId: run.id,
        competitionId,
        iteration: 1,
        laneId: laneA,
        shotId: '99999999-9999-4999-8999-999999999997',
        scoreX10: 101,
        x: null,
        y: null,
        firedAt: '2026-09-02T03:09:58.000Z',
      }),
    ).toThrow('has not opened its firing window');

    while (run.currentStep) {
      const confirmed = service.confirmStep({
        runId: run.id,
        stepId: run.currentStep.step.id,
        officialName: 'CRO A',
      });
      run = service.recordExecution({
        runId: run.id,
        confirmationEntryId: confirmed.currentStep!.confirmationEntryId!,
        status: 'DONE',
        statement: 'Completed',
        officialName: 'CRO A',
      });
    }
    expect(run.shootOff?.status).toBe('AWAITING_RESOLUTION');

    expect(() =>
      service.observeShootOffShot({
        runId: run.id,
        competitionId: '99999999-9999-4999-8999-999999999999',
        iteration: 1,
        laneId: laneA,
        shotId: '99999999-9999-4999-8999-999999999998',
        scoreX10: 101,
        x: null,
        y: null,
        firedAt: '2026-09-02T03:09:59.000Z',
      }),
    ).toThrow('competition does not match');

    run = service.observeShootOffShot({
      runId: run.id,
      competitionId,
      iteration: 1,
      laneId: laneA,
      shotId: '33333333-3333-4333-8333-333333333333',
      scoreX10: 101,
      x: 1,
      y: 2,
      firedAt: '2026-09-02T03:10:00.000Z',
    });
    run = service.observeShootOffShot({
      runId: run.id,
      competitionId,
      iteration: 1,
      laneId: laneB,
      shotId: '44444444-4444-4444-8444-444444444444',
      scoreX10: 98,
      x: 3,
      y: 4,
      firedAt: '2026-09-02T03:10:01.000Z',
    });
    expect(run.shootOff?.shots).toHaveLength(2);

    run = service.closeShootOffRound({
      runId: run.id,
      statement: 'Lane B is the unique lowest score.',
      officialName: 'Jury A',
    });
    expect(run.currentBranch).toBe('MAIN');
    expect(run.currentStep?.step.effect.type).toBe('CHECKPOINT');
    expect(run.entries.at(-1)?.metadata).toMatchObject({ eliminatedLaneId: laneB, remainingTiedLaneIds: [] });

    const replayed = service.observeShootOffShot({
      runId: run.id,
      competitionId,
      iteration: 1,
      laneId: laneB,
      shotId: '44444444-4444-4444-8444-444444444444',
      scoreX10: 98,
      x: 3,
      y: 4,
      firedAt: '2026-09-02T03:10:01.000Z',
    });
    expect(replayed.currentBranch).toBe('MAIN');
    expect(replayed.shootOffShots).toHaveLength(2);
  });

  it('scores a Mixed Team shoot-off by immutable two-Lane team units', () => {
    const { service } = createMixedTeamService();
    let run = service.create({
      competitionId,
      competitionTypeId: 'ARMIX_FINAL',
      scheduledStartAt: '2026-09-02T03:00:00.000Z',
      officialName: 'CRO A',
    });
    while (run.currentStep?.step.effect.type !== 'CHECKPOINT') {
      const confirmed = service.confirmStep({
        runId: run.id,
        stepId: run.currentStep!.step.id,
        officialName: 'CRO A',
      });
      run = service.recordExecution({
        runId: run.id,
        confirmationEntryId: confirmed.currentStep!.confirmationEntryId!,
        status: 'DONE',
        statement: 'Completed',
        officialName: 'CRO A',
      });
    }

    expect(() =>
      service.startShootOff({
        runId: run.id,
        checkpointStepId: run.currentStep!.step.id,
        eligibleLaneIds: [laneA, laneB, laneC, laneD],
        reason: 'Two teams are tied.',
        officialName: 'Jury A',
      }),
    ).toThrow('requires explicit two-Lane scoring units');

    run = service.startShootOff({
      runId: run.id,
      checkpointStepId: run.currentStep.step.id,
      eligibleLaneIds: [laneA, laneB, laneC, laneD],
      units: [
        { unitId: 'TEAM-A', label: 'Team Alpha', laneIds: [laneA, laneB] },
        { unitId: 'TEAM-B', label: 'Team Bravo', laneIds: [laneC, laneD] },
      ],
      reason: 'Two teams are tied.',
      officialName: 'Jury A',
    });
    expect(run.shootOff?.units).toEqual([
      { unitId: 'TEAM-A', label: 'Team Alpha', laneIds: [laneA, laneB] },
      { unitId: 'TEAM-B', label: 'Team Bravo', laneIds: [laneC, laneD] },
    ]);

    while (run.currentStep) {
      const confirmed = service.confirmStep({
        runId: run.id,
        stepId: run.currentStep.step.id,
        officialName: 'CRO A',
      });
      run = service.recordExecution({
        runId: run.id,
        confirmationEntryId: confirmed.currentStep!.confirmationEntryId!,
        status: 'DONE',
        statement: 'Completed',
        officialName: 'CRO A',
      });
    }

    const shots = [
      { laneId: laneA, shotId: '55555555-5555-4555-8555-555555555555', scoreX10: 105 },
      { laneId: laneB, shotId: '66666666-6666-4666-8666-666666666666', scoreX10: 100 },
      { laneId: laneC, shotId: '77777777-7777-4777-8777-777777777777', scoreX10: 109 },
      { laneId: laneD, shotId: '88888888-8888-4888-8888-888888888888', scoreX10: 98 },
    ];
    for (const [index, shot] of shots.entries()) {
      run = service.observeShootOffShot({
        runId: run.id,
        competitionId,
        iteration: 1,
        ...shot,
        x: null,
        y: null,
        firedAt: `2026-09-02T03:10:0${index}.000Z`,
      });
    }

    run = service.closeShootOffRound({
      runId: run.id,
      statement: 'Team Alpha has the unique lowest aggregate.',
      officialName: 'Jury A',
    });
    expect(run.entries.at(-1)?.metadata).toMatchObject({
      minimumScoreX10: 205,
      eliminatedUnitId: 'TEAM-A',
      eliminatedLaneIds: [laneA, laneB],
      eliminatedLaneId: null,
      remainingTiedUnitIds: [],
      remainingTiedLaneIds: [],
      unitScores: [
        { unitId: 'TEAM-A', scoreX10: 205 },
        { unitId: 'TEAM-B', scoreX10: 207 },
      ],
    });
  });

  it('projects a 25m five-shot shoot-off to hits while preserving every decimal source score', () => {
    const { service } = create25mService(ISSF_2026_P25_FINAL);
    let run = service.create({
      competitionId,
      competitionTypeId: 'P25_FINAL',
      scheduledStartAt: '2026-09-02T03:00:00.000Z',
      officialName: 'CRO A',
    });
    while (run.currentStep?.step.effect.type !== 'CHECKPOINT') {
      const confirmed = service.confirmStep({
        runId: run.id,
        stepId: run.currentStep!.step.id,
        officialName: 'CRO A',
      });
      run = service.recordExecution({
        runId: run.id,
        confirmationEntryId: confirmed.currentStep!.confirmationEntryId!,
        status: 'DONE',
        statement: 'Completed',
        officialName: 'CRO A',
      });
    }
    run = service.startShootOff({
      runId: run.id,
      checkpointStepId: run.currentStep.step.id,
      eligibleLaneIds: [laneA, laneB],
      reason: 'Rank 8 is tied.',
      officialName: 'Jury A',
    });
    expect(run.shootOff?.shotsPerLane).toBe(5);

    while (run.currentStep) {
      const confirmed = service.confirmStep({
        runId: run.id,
        stepId: run.currentStep.step.id,
        officialName: 'CRO A',
      });
      run = service.recordExecution({
        runId: run.id,
        confirmationEntryId: confirmed.currentStep!.confirmationEntryId!,
        status: 'DONE',
        statement: 'Completed',
        officialName: 'CRO A',
      });
    }

    const scores = new Map([
      [laneA, [102, 102, 102, 102, 102]],
      [laneB, [101, 102, 103, 90, 109]],
    ]);
    let shotNumber = 10;
    for (const [laneId, laneScores] of scores) {
      for (const scoreX10 of laneScores) {
        shotNumber += 1;
        run = service.observeShootOffShot({
          runId: run.id,
          competitionId,
          iteration: 1,
          laneId,
          shotId: `00000000-0000-4000-8000-${String(shotNumber).padStart(12, '0')}`,
          scoreX10,
          x: null,
          y: null,
          firedAt: '2026-09-02T03:10:00.000Z',
        });
      }
    }
    const laneBShots = run.shootOff?.shots.filter((shot) => shot.laneId === laneB) ?? [];
    expect(laneBShots.map((shot) => shot.sourceScoreX10).sort((left, right) => left - right)).toEqual([
      90, 101, 102, 103, 109,
    ]);
    expect(laneBShots.every((shot) => shot.scoreX10 === (shot.sourceScoreX10 >= 102 ? 10 : 0))).toBe(true);

    run = service.closeShootOffRound({
      runId: run.id,
      statement: 'Lane B has three hits and is the unique lowest.',
      officialName: 'Jury A',
    });
    expect(run.entries.at(-1)?.metadata).toMatchObject({
      minimumScoreX10: 30,
      eliminatedLaneId: laneB,
      shotsPerLane: 5,
    });
  });
});

// SPDX-License-Identifier: MIT
import { ISSF_2026_AR60_FINAL, ISSF_2026_P25_FINAL } from '@sasakiuri/saika-rules';
import type { CompetitionStatePayload } from '@sasakiuri/saika-protocol/CompetitionState';
import { describe, expect, it, vi } from 'vitest';

import {
  createFinalScriptStepPort,
  type FinalScriptStepPortDependencies,
} from '@/main/modules/mqtt/application/createFinalScriptStepPort';
import type { CommandExecutionResult } from '@/main/modules/mqtt/application/DirectorMqttTypes';
import { competitionTypeFromRulePack, RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID } from '@/shared/competitionTypes';
import type { FinalOperationScriptStepDto } from '@/shared/ipc/contracts';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_COMPETITION_ID = '99999999-9999-4999-8999-999999999999';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const LANE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LANE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LANE_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EVENT_ID = '66666666-6666-4666-8666-666666666666';

const AR60_FINAL = competitionTypeFromRulePack(ISSF_2026_AR60_FINAL);
const P25_FINAL = competitionTypeFromRulePack(ISSF_2026_P25_FINAL);
const DEFINITIONS = new Map([AR60_FINAL, P25_FINAL].map((definition) => [definition.id, definition]));
const MATCH_REQUIREMENT_IDS = AR60_FINAL.phaseStartRequirements?.MATCH?.map(({ id }) => id) ?? [];

type Phase = CompetitionStatePayload['phase'];

interface LaneFixture {
  readonly competitionId?: string;
  readonly phase?: Phase | 'FINISHED';
  readonly stageIndex?: number;
  readonly seriesIndex?: number;
  readonly awaitingSeriesStart?: boolean;
  readonly startNumber?: number;
}

function commandResult(
  action: string,
  lanes: CommandExecutionResult['lanes'] = [],
  success = true,
): CommandExecutionResult {
  return { commandId: `${action}-command`, action, success, lanes } as CommandExecutionResult;
}

function step(effect: FinalOperationScriptStepDto['effect'], id = 'final.step'): FinalOperationScriptStepDto {
  return {
    id,
    actor: 'CRO',
    kind: 'COMMAND',
    text: 'START',
    ruleReference: '6.17.2',
    timing: { mode: 'MANUAL' },
    effect,
  };
}

function seriesTarget(stageIndex: number, seriesIndex: number) {
  return { stageId: `stage-${stageIndex}`, stageIndex, seriesIndex };
}

function timedTargetStep(
  effect: Partial<Extract<FinalOperationScriptStepDto['effect'], { type: 'RUN_TIMED_TARGET' }>> = {},
): FinalOperationScriptStepDto {
  return step({
    type: 'RUN_TIMED_TARGET',
    purpose: 'MATCH',
    participantSelection: 'ALL_ACTIVE',
    programId: 'P25_FINAL_MATCH_RAPID_3_7',
    shotsPerParticipant: 5,
    target: seriesTarget(1, 0),
    ...effect,
  });
}

function setup(options: {
  readonly competitionTypeId: string;
  readonly phase: Phase;
  readonly laneIds?: readonly string[];
  readonly lanes?: Readonly<Record<string, LaneFixture>>;
  readonly activeTimer?: boolean;
}) {
  const competition = {
    competitionId: COMPETITION_ID,
    competitionTypeId: options.competitionTypeId,
    phase: options.phase,
    laneIds: [...(options.laneIds ?? [LANE_A, LANE_B])],
    ...(options.activeTimer
      ? {
          activeTimer: {
            timerScope: 'SERIES',
            timerStartAt: '2026-11-28T00:00:00.000Z',
            timerDurationSeconds: 250,
            stageIndex: 1,
            seriesIndex: 0,
          },
        }
      : {}),
  } as unknown as CompetitionStatePayload;
  const lanes = new Map(Object.entries(options.lanes ?? {}));
  const getLane = vi.fn((laneId: string) => {
    const lane = lanes.get(laneId);
    if (!lane) return undefined;
    return {
      competitionState: {
        competitionId: lane.competitionId ?? COMPETITION_ID,
        phase: lane.phase ?? competition.phase,
        currentStage: { index: lane.stageIndex ?? 1 },
        currentSeries: { index: lane.seriesIndex ?? 0 },
        awaitingSeriesStart: lane.awaitingSeriesStart ?? false,
      },
      assignment: lane.startNumber === undefined ? null : { athlete: { startNumber: lane.startNumber } },
    };
  });
  const mqttService = {
    publishCompetitionCue: vi.fn().mockResolvedValue(undefined),
    startSighting: vi.fn(async () => {
      competition.phase = 'SIGHTING';
      return commandResult('start-sighting');
    }),
    endSighting: vi.fn(async () => {
      competition.phase = 'SIGHTING_COMPLETE';
      return commandResult('end-sighting');
    }),
    startMatch: vi.fn(async () => {
      competition.phase = 'MATCH';
      return commandResult('start-match');
    }),
    advanceSeries: vi.fn(async () => commandResult('advance-series')),
    getLane,
    startShootOff: vi.fn(async () => commandResult('start-shootoff')),
    startTimedTarget: vi.fn(async () => commandResult('start-timed-target')),
    stopActiveTimer: vi.fn(async () => commandResult('stop-timer')),
    stopShootOff: vi.fn(async () => commandResult('stop-shootoff')),
  };
  const finalResultDeclarationService = {
    getStatus: vi.fn(),
    declare: vi.fn(),
  };
  const port = createFinalScriptStepPort(
    { competitionId: COMPETITION_ID, runId: RUN_ID, iteration: 2 },
    {
      mqttService: mqttService as unknown as FinalScriptStepPortDependencies['mqttService'],
      competitionTypeRegistry: {
        get: (id: string) => {
          const definition = DEFINITIONS.get(id);
          if (!definition) throw new Error(`Unknown competition type ${id}`);
          return definition;
        },
      },
      finalResultDeclarationService:
        finalResultDeclarationService as unknown as FinalScriptStepPortDependencies['finalResultDeclarationService'],
      requireCompetition: (competitionId) => {
        if (competitionId !== COMPETITION_ID) throw new Error(`Unknown competition ${competitionId}`);
        return competition;
      },
    },
  );
  return { port, competition, mqttService, finalResultDeclarationService };
}

describe('createFinalScriptStepPort cue and sighting control', () => {
  it('publishes the cue through the MQTT service', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'AR60_FINAL', phase: 'NOT_STARTED' });
    const cue = { cueId: 'cue-1', text: 'LOAD' } as never;

    await port.publishCue(cue);

    expect(mqttService.publishCompetitionCue).toHaveBeenCalledExactlyOnceWith(cue);
  });

  it('does not reopen a sighting stage that is already running', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'P25_FINAL', phase: 'SIGHTING' });

    await expect(port.openSighting(120, [])).resolves.toBeNull();
    expect(mqttService.startSighting).not.toHaveBeenCalled();
  });

  it('refuses to open sighting until the Rule Pack call-to-line requirement is acknowledged', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'P25_FINAL', phase: 'NOT_STARTED' });

    await expect(port.openSighting(120, [])).rejects.toThrow(
      `requires SIGHTING start acknowledgement(s): ${RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID}`,
    );
    expect(mqttService.startSighting).not.toHaveBeenCalled();

    await expect(port.openSighting(120, [RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID])).resolves.toMatchObject({
      action: 'start-sighting',
    });
    expect(mqttService.startSighting).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID, 120);
  });

  it.each(['SIGHTING_COMPLETE', 'MATCH', 'MATCH_COMPLETE'] as const)(
    'treats closing sighting as already done in phase %s',
    async (phase) => {
      const { port, mqttService } = setup({ competitionTypeId: 'AR60_FINAL', phase });

      await expect(port.closeSighting()).resolves.toBeNull();
      expect(mqttService.endSighting).not.toHaveBeenCalled();
    },
  );

  it('closes a running sighting stage', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'AR60_FINAL', phase: 'SIGHTING' });

    await expect(port.closeSighting()).resolves.toMatchObject({ action: 'end-sighting' });
    expect(mqttService.endSighting).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID);
  });
});

describe('createFinalScriptStepPort MATCH firing', () => {
  const openFiring = (target: ReturnType<typeof seriesTarget> | undefined, durationSeconds = 250) =>
    step({
      type: 'OPEN_FIRING',
      purpose: 'MATCH',
      participantSelection: 'ALL_ACTIVE',
      durationSeconds,
      ...(target ? { target } : {}),
    });

  it('rejects a step that is not a targeted MATCH firing', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'AR60_FINAL', phase: 'SIGHTING_COMPLETE' });

    await expect(port.openMatch(openFiring(undefined), [])).rejects.toThrow(
      'Final step final.step has no MATCH target',
    );
    await expect(
      port.openMatch(
        step({
          type: 'OPEN_FIRING',
          purpose: 'SIGHTING',
          participantSelection: 'ALL_ACTIVE',
          durationSeconds: 300,
          target: seriesTarget(1, 0),
        }),
        [],
      ),
    ).rejects.toThrow('has no MATCH target');
    expect(mqttService.startMatch).not.toHaveBeenCalled();
  });

  it('returns no command when every Lane already fires the target series', async () => {
    const { port, mqttService } = setup({
      competitionTypeId: 'AR60_FINAL',
      phase: 'MATCH',
      lanes: { [LANE_A]: { stageIndex: 1, seriesIndex: 1 }, [LANE_B]: { stageIndex: 1, seriesIndex: 1 } },
    });

    await expect(port.openMatch(openFiring(seriesTarget(1, 1)), [])).resolves.toBeNull();
    expect(mqttService.advanceSeries).not.toHaveBeenCalled();
  });

  it('starts the first MATCH series only after its readiness requirements are acknowledged', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'AR60_FINAL', phase: 'SIGHTING_COMPLETE' });

    await expect(port.openMatch(openFiring(seriesTarget(1, 0)), [])).rejects.toThrow(
      `requires MATCH start acknowledgement(s): ${MATCH_REQUIREMENT_IDS.join(', ')}`,
    );
    expect(mqttService.startMatch).not.toHaveBeenCalled();

    await expect(port.openMatch(openFiring(seriesTarget(1, 0)), MATCH_REQUIREMENT_IDS)).resolves.toMatchObject({
      action: 'start-match',
    });
    expect(mqttService.startMatch).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID, 250);
  });

  it('advances from the preceding series with the Rule Pack timer for the target', async () => {
    const { port, mqttService } = setup({
      competitionTypeId: 'AR60_FINAL',
      phase: 'MATCH',
      lanes: { [LANE_A]: { stageIndex: 1, seriesIndex: 0 }, [LANE_B]: { stageIndex: 1, seriesIndex: 1 } },
    });

    await expect(port.openMatch(openFiring(seriesTarget(1, 1)), [])).resolves.toMatchObject({
      action: 'advance-series',
    });
    expect(mqttService.advanceSeries).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID, 1, 0, undefined, {
      durationSeconds: 250,
      stageIndex: 1,
      seriesIndex: 1,
    });
    expect(mqttService.startMatch).not.toHaveBeenCalled();
  });

  it('advances across stages into the single-shot elimination timer', async () => {
    const { port, mqttService } = setup({
      competitionTypeId: 'AR60_FINAL',
      phase: 'MATCH',
      lanes: { [LANE_A]: { competitionId: OTHER_COMPETITION_ID, stageIndex: 2, seriesIndex: 0 } },
    });

    await port.openMatch(openFiring(seriesTarget(2, 0), 50), []);

    expect(mqttService.advanceSeries).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID, 1, 1, undefined, {
      durationSeconds: 50,
      stageIndex: 2,
      seriesIndex: 0,
    });
  });

  it('rejects a script duration that disagrees with the configured series timer', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'AR60_FINAL', phase: 'MATCH' });

    await expect(port.openMatch(openFiring(seriesTarget(2, 0), 60), [])).rejects.toThrow(
      'Final script timer does not match target 2:0',
    );
    expect(mqttService.advanceSeries).not.toHaveBeenCalled();
  });

  it('rejects advancing into a series that is driven by a timed-target program', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'P25_FINAL', phase: 'MATCH' });

    await expect(port.openMatch(openFiring(seriesTarget(1, 1), 3), [])).rejects.toThrow(
      'Final script timer does not match target 1:1',
    );
    expect(mqttService.advanceSeries).not.toHaveBeenCalled();
  });

  it('stops only an active MATCH timer', async () => {
    const complete = setup({ competitionTypeId: 'AR60_FINAL', phase: 'MATCH_COMPLETE', activeTimer: true });
    await expect(complete.port.closeMatch()).resolves.toBeNull();

    const idle = setup({ competitionTypeId: 'AR60_FINAL', phase: 'MATCH' });
    await expect(idle.port.closeMatch()).resolves.toBeNull();

    const running = setup({ competitionTypeId: 'AR60_FINAL', phase: 'MATCH', activeTimer: true });
    await expect(running.port.closeMatch()).resolves.toMatchObject({ action: 'stop-timer' });

    expect(complete.mqttService.stopActiveTimer).not.toHaveBeenCalled();
    expect(idle.mqttService.stopActiveTimer).not.toHaveBeenCalled();
    expect(running.mqttService.stopActiveTimer).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID);
  });
});

describe('createFinalScriptStepPort timed-target series', () => {
  it('rejects steps and definitions that cannot run a timed target', async () => {
    const p25 = setup({ competitionTypeId: 'P25_FINAL', phase: 'MATCH' });
    await expect(p25.port.runTimedTarget(step({ type: 'CHECKPOINT' }, 'final.checkpoint'), [], [])).rejects.toThrow(
      'Final step final.checkpoint is not a timed-target step',
    );
    await expect(
      p25.port.runTimedTarget(timedTargetStep({ programId: 'P25_FINAL_SHOOT_OFF_RAPID_3_7' }), [], []),
    ).rejects.toThrow('Final step final.step timed-target program is unavailable');

    const ar60 = setup({ competitionTypeId: 'AR60_FINAL', phase: 'MATCH' });
    await expect(ar60.port.runTimedTarget(timedTargetStep(), [], [])).rejects.toThrow(
      'Final step final.step requires an unavailable timed-target capability',
    );
    expect(p25.mqttService.startTimedTarget).not.toHaveBeenCalled();
  });

  it('rejects a series step without a configured MATCH series target', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'P25_FINAL', phase: 'MATCH' });

    await expect(port.runTimedTarget(timedTargetStep({ target: undefined }), [], [])).rejects.toThrow(
      'Final step final.step has no timed-target series target',
    );
    await expect(port.runTimedTarget(timedTargetStep({ target: seriesTarget(0, 0) }), [], [])).rejects.toThrow(
      'Final step final.step targets an unavailable timed-target series',
    );
    await expect(port.runTimedTarget(timedTargetStep({ target: seriesTarget(1, 10) }), [], [])).rejects.toThrow(
      'targets an unavailable timed-target series',
    );
    expect(mqttService.startTimedTarget).not.toHaveBeenCalled();
  });

  it('requires the sighting sequence before MATCH timed-target firing', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'P25_FINAL', phase: 'NOT_STARTED' });

    await expect(port.runTimedTarget(timedTargetStep(), [], [])).rejects.toThrow(
      'The configured sighting sequence must run before MATCH timed-target firing',
    );
    expect(mqttService.startSighting).not.toHaveBeenCalled();
  });

  it('walks a fresh competition through sighting into MATCH before the sighting timed target', async () => {
    const { port, competition, mqttService } = setup({
      competitionTypeId: 'P25_FINAL',
      phase: 'NOT_STARTED',
      lanes: { [LANE_A]: { phase: 'MATCH' }, [LANE_B]: { phase: 'MATCH' } },
    });
    const sightingStep = timedTargetStep({ purpose: 'SIGHTING', programId: 'P25_FINAL_SIGHTING_RAPID_3_7' });

    await expect(port.runTimedTarget(sightingStep, [RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID], [])).resolves.toMatchObject(
      { action: 'start-timed-target' },
    );

    expect(competition.phase).toBe('MATCH');
    expect(mqttService.startSighting).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID, 120);
    expect(mqttService.endSighting).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID);
    expect(mqttService.startMatch).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID);
    expect(mqttService.startSighting.mock.invocationCallOrder[0]).toBeLessThan(
      mqttService.endSighting.mock.invocationCallOrder[0]!,
    );
    expect(mqttService.endSighting.mock.invocationCallOrder[0]).toBeLessThan(
      mqttService.startMatch.mock.invocationCallOrder[0]!,
    );
    expect(mqttService.advanceSeries).not.toHaveBeenCalled();
    expect(mqttService.startTimedTarget).toHaveBeenCalledExactlyOnceWith({
      competitionId: COMPETITION_ID,
      programId: 'P25_FINAL_SIGHTING_RAPID_3_7',
      purpose: 'SIGHTING',
      stageIndex: 1,
      seriesIndex: 0,
      targetLaneIds: [LANE_A, LANE_B],
    });
  });

  it('stops the preparation sequence when a Lane does not confirm the sighting start', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'P25_FINAL', phase: 'NOT_STARTED' });
    mqttService.startSighting.mockResolvedValueOnce(
      commandResult(
        'start-sighting',
        [
          { laneId: LANE_A, status: 'done' },
          { laneId: LANE_B, status: 'timeout' },
        ],
        false,
      ),
    );
    const sightingStep = timedTargetStep({ purpose: 'SIGHTING', programId: 'P25_FINAL_SIGHTING_RAPID_3_7' });

    await expect(port.runTimedTarget(sightingStep, [RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID], [])).rejects.toThrow(
      `Preparing the Lane sighting stage did not complete on Lane(s): ${LANE_B}`,
    );
    expect(mqttService.endSighting).not.toHaveBeenCalled();
    expect(mqttService.startTimedTarget).not.toHaveBeenCalled();
  });

  it('rejects timed-target firing after the MATCH is complete', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'P25_FINAL', phase: 'MATCH_COMPLETE' });

    await expect(port.runTimedTarget(timedTargetStep(), [], [])).rejects.toThrow(
      'Timed-target Final cannot run from competition phase MATCH_COMPLETE',
    );
    expect(mqttService.startTimedTarget).not.toHaveBeenCalled();
  });

  it('requires at least one active Lane and refuses retired Lane selections', async () => {
    const allRetired = setup({
      competitionTypeId: 'P25_FINAL',
      phase: 'MATCH',
      lanes: { [LANE_A]: { phase: 'FINISHED' }, [LANE_B]: { phase: 'FINISHED' } },
    });
    await expect(allRetired.port.runTimedTarget(timedTargetStep(), [], [])).rejects.toThrow(
      'Timed-target Final step has no active Lane',
    );

    const oneRetired = setup({
      competitionTypeId: 'P25_FINAL',
      phase: 'MATCH',
      lanes: { [LANE_A]: { phase: 'MATCH' }, [LANE_B]: { phase: 'FINISHED' } },
    });
    await expect(oneRetired.port.runTimedTarget(timedTargetStep(), [], [LANE_A, LANE_B])).rejects.toThrow(
      `Timed-target Final step selected retired Lane(s): ${LANE_B}`,
    );
    expect(oneRetired.mqttService.startTimedTarget).not.toHaveBeenCalled();
  });

  it('advances to the target series and fires only the eligible Lanes', async () => {
    const { port, mqttService } = setup({
      competitionTypeId: 'P25_FINAL',
      phase: 'MATCH',
      laneIds: [LANE_A, LANE_B, LANE_C],
      lanes: {
        [LANE_A]: { stageIndex: 1, seriesIndex: 1, awaitingSeriesStart: true },
        [LANE_B]: { stageIndex: 1, seriesIndex: 0 },
        [LANE_C]: { phase: 'FINISHED' },
      },
    });

    await port.runTimedTarget(timedTargetStep({ target: seriesTarget(1, 1) }), [], [LANE_A, LANE_B, LANE_A]);

    expect(mqttService.advanceSeries).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID, 1, 0);
    expect(mqttService.startTimedTarget).toHaveBeenCalledExactlyOnceWith({
      competitionId: COMPETITION_ID,
      programId: 'P25_FINAL_MATCH_RAPID_3_7',
      purpose: 'MATCH',
      stageIndex: 1,
      seriesIndex: 1,
      targetLaneIds: [LANE_A, LANE_B],
    });
  });

  it('fires all still-active Lanes without advancing when they already await the target', async () => {
    const { port, mqttService } = setup({
      competitionTypeId: 'P25_FINAL',
      phase: 'MATCH',
      laneIds: [LANE_A, LANE_B, LANE_C],
      lanes: {
        [LANE_A]: { stageIndex: 1, seriesIndex: 2 },
        [LANE_B]: { stageIndex: 1, seriesIndex: 2 },
        [LANE_C]: { phase: 'FINISHED' },
      },
    });

    await port.runTimedTarget(timedTargetStep({ target: seriesTarget(1, 2) }), [], []);

    expect(mqttService.advanceSeries).not.toHaveBeenCalled();
    expect(mqttService.startTimedTarget).toHaveBeenCalledWith(
      expect.objectContaining({ seriesIndex: 2, targetLaneIds: [LANE_A, LANE_B] }),
    );
  });

  it('does not start the timed target when the series advance fails', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'P25_FINAL', phase: 'MATCH' });
    mqttService.advanceSeries.mockResolvedValueOnce(
      commandResult('advance-series', [{ laneId: LANE_A, status: 'done' }], false),
    );

    await expect(port.runTimedTarget(timedTargetStep({ target: seriesTarget(1, 3) }), [], [])).rejects.toThrow(
      'Advancing to 1:3 did not complete on Lane(s): unknown',
    );
    expect(mqttService.advanceSeries).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID, 1, 2);
    expect(mqttService.startTimedTarget).not.toHaveBeenCalled();
  });
});

describe('createFinalScriptStepPort timed-target shoot-off', () => {
  const shootOffStep = (
    execution: Partial<Extract<FinalOperationScriptStepDto['effect'], { type: 'RUN_TIMED_TARGET' }>> = {},
  ) =>
    timedTargetStep({
      purpose: 'SHOOT_OFF',
      participantSelection: 'TIED_ONLY',
      programId: 'P25_FINAL_SHOOT_OFF_RAPID_3_7',
      target: undefined,
      participantExecution: 'SEQUENTIAL',
      participantOrder: 'FINAL_START_NUMBER_ASCENDING',
      ...execution,
    });

  it('requires a participant execution mode and at least two distinct Lanes', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'P25_FINAL', phase: 'MATCH_COMPLETE' });

    await expect(
      port.runTimedTarget(shootOffStep({ participantExecution: undefined }), [], [LANE_A, LANE_B]),
    ).rejects.toThrow('Final step final.step has no shoot-off participant execution mode');
    await expect(port.runTimedTarget(shootOffStep(), [], [LANE_A, LANE_A])).rejects.toThrow(
      'Timed-target shoot-off requires at least two Lanes',
    );
    expect(mqttService.startShootOff).not.toHaveBeenCalled();
  });

  it('refuses a shoot-off that includes a retired Lane', async () => {
    const { port, mqttService } = setup({
      competitionTypeId: 'P25_FINAL',
      phase: 'MATCH_COMPLETE',
      laneIds: [LANE_A, LANE_B, LANE_C],
      lanes: { [LANE_C]: { phase: 'FINISHED' } },
    });

    await expect(port.runTimedTarget(shootOffStep(), [], [LANE_A, LANE_C])).rejects.toThrow(
      `Timed-target shoot-off selected retired Lane(s): ${LANE_C}`,
    );
    expect(mqttService.startShootOff).not.toHaveBeenCalled();
  });

  it('orders a sequential shoot-off by Finals Start Number for this run iteration', async () => {
    const { port, mqttService } = setup({
      competitionTypeId: 'P25_FINAL',
      phase: 'MATCH_COMPLETE',
      laneIds: [LANE_A, LANE_B, LANE_C],
      lanes: {
        [LANE_A]: { phase: 'MATCH_COMPLETE', startNumber: 7 },
        [LANE_B]: { phase: 'MATCH_COMPLETE', startNumber: 2 },
        [LANE_C]: { phase: 'MATCH_COMPLETE', startNumber: 5 },
      },
    });

    await expect(port.runTimedTarget(shootOffStep(), [], [LANE_A, LANE_B, LANE_C])).resolves.toMatchObject({
      action: 'start-shootoff',
    });

    expect(mqttService.startShootOff).toHaveBeenCalledExactlyOnceWith(
      COMPETITION_ID,
      RUN_ID,
      2,
      { type: 'TIMED_TARGET', programId: 'P25_FINAL_SHOOT_OFF_RAPID_3_7', participantExecution: 'SEQUENTIAL' },
      5,
      [LANE_B, LANE_C, LANE_A],
    );
    expect(mqttService.startTimedTarget).not.toHaveBeenCalled();
  });

  it('keeps the selected order for a simultaneous shoot-off', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'P25_FINAL', phase: 'MATCH_COMPLETE' });

    await port.runTimedTarget(
      shootOffStep({ participantExecution: 'SIMULTANEOUS', participantOrder: undefined }),
      [],
      [LANE_B, LANE_A],
    );

    expect(mqttService.startShootOff).toHaveBeenCalledWith(
      COMPETITION_ID,
      RUN_ID,
      2,
      expect.objectContaining({ type: 'TIMED_TARGET', participantExecution: 'SIMULTANEOUS' }),
      5,
      [LANE_B, LANE_A],
    );
  });
});

describe('createFinalScriptStepPort generic shoot-off and declaration', () => {
  it('opens and closes a generic shoot-off for the run iteration', async () => {
    const { port, mqttService } = setup({ competitionTypeId: 'AR60_FINAL', phase: 'MATCH_COMPLETE' });

    await expect(port.openShootOff(50, 1, [LANE_A, LANE_B])).resolves.toMatchObject({ action: 'start-shootoff' });
    await expect(port.closeShootOff([LANE_A, LANE_B])).resolves.toMatchObject({ action: 'stop-shootoff' });

    expect(mqttService.startShootOff).toHaveBeenCalledExactlyOnceWith(
      COMPETITION_ID,
      RUN_ID,
      2,
      { type: 'GENERIC', durationSeconds: 50 },
      1,
      [LANE_A, LANE_B],
    );
    expect(mqttService.stopShootOff).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID, RUN_ID, 2, [LANE_A, LANE_B]);
  });

  const declaration = {
    eventId: EVENT_ID,
    finalProtestsResolved: true as const,
    resultProcessConfirmed: true as const,
    statement: 'RESULTS ARE FINAL',
    officialName: 'Chief Range Officer',
  };

  it('declares the Final results when no declaration exists yet', async () => {
    const { port, finalResultDeclarationService } = setup({ competitionTypeId: 'AR60_FINAL', phase: 'MATCH_COMPLETE' });
    finalResultDeclarationService.getStatus.mockResolvedValue({ declaration: null });
    finalResultDeclarationService.declare.mockResolvedValue({ declaration: { id: 'declaration-1' } });

    await expect(port.declareResults(declaration)).resolves.toEqual({
      declarationId: 'declaration-1',
      replayed: false,
    });
    expect(finalResultDeclarationService.getStatus).toHaveBeenCalledExactlyOnceWith(EVENT_ID);
    expect(finalResultDeclarationService.declare).toHaveBeenCalledExactlyOnceWith(declaration);
  });

  it('fails when the declaration was not persisted', async () => {
    const { port, finalResultDeclarationService } = setup({ competitionTypeId: 'AR60_FINAL', phase: 'MATCH_COMPLETE' });
    finalResultDeclarationService.getStatus.mockResolvedValue({ declaration: null });
    finalResultDeclarationService.declare.mockResolvedValue({ declaration: null });

    await expect(port.declareResults(declaration)).rejects.toThrow('The Final result declaration was not persisted');
  });

  it('replays a current declaration without declaring again', async () => {
    const { port, finalResultDeclarationService } = setup({ competitionTypeId: 'AR60_FINAL', phase: 'MATCH_COMPLETE' });
    finalResultDeclarationService.getStatus.mockResolvedValue({
      declaration: { id: 'declaration-1' },
      declarationCurrent: true,
      issues: [],
    });

    await expect(port.declareResults(declaration)).resolves.toEqual({
      declarationId: 'declaration-1',
      replayed: true,
    });
    expect(finalResultDeclarationService.declare).not.toHaveBeenCalled();
  });

  it('refuses to replay a declaration that is no longer current', async () => {
    const { port, finalResultDeclarationService } = setup({ competitionTypeId: 'AR60_FINAL', phase: 'MATCH_COMPLETE' });
    finalResultDeclarationService.getStatus.mockResolvedValue({
      declaration: { id: 'declaration-1' },
      declarationCurrent: false,
      issues: [],
    });

    await expect(port.declareResults(declaration)).rejects.toThrow(
      'The existing Final declaration is no longer current or has review blockers',
    );
    expect(finalResultDeclarationService.declare).not.toHaveBeenCalled();
  });
});

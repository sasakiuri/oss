// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import {
  executeFinalScriptStep,
  type FinalScriptStepExecutionInput,
  type FinalScriptStepExecutionPort,
} from '@/main/modules/mqtt/application/FinalScriptStepExecutor';
import type { FinalOperationScriptStepDto } from '@/shared/ipc/contracts';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const CONFIRMATION_ID = '33333333-3333-4333-8333-333333333333';
const DECLARATION_ID = '55555555-5555-4555-8555-555555555555';
const EVENT_ID = '66666666-6666-4666-8666-666666666666';

function input(step: FinalOperationScriptStepDto): FinalScriptStepExecutionInput {
  return {
    competitionId: COMPETITION_ID,
    runId: RUN_ID,
    confirmationEntryId: CONFIRMATION_ID,
    branch: 'MAIN',
    iteration: 0,
    step,
    eligibleLaneIds: [],
    acknowledgedRequirementIds: [],
    declaration: null,
  };
}

function port(): FinalScriptStepExecutionPort {
  return {
    publishCue: vi.fn().mockResolvedValue(undefined),
    openSighting: vi.fn(),
    closeSighting: vi.fn(),
    openMatch: vi.fn(),
    runTimedTarget: vi.fn(),
    closeMatch: vi.fn(),
    openShootOff: vi.fn(),
    closeShootOff: vi.fn(),
    declareResults: vi.fn(),
  };
}

function step(effect: FinalOperationScriptStepDto['effect']): FinalOperationScriptStepDto {
  return {
    id: 'final.step',
    actor: 'CRO',
    kind: 'COMMAND',
    text: 'START',
    ruleReference: '6.17.2',
    timing: { mode: 'MANUAL' },
    effect,
  };
}

describe('executeFinalScriptStep', () => {
  it('publishes cue-only steps using the confirmation as the idempotent cue ID', async () => {
    const adapter = port();
    const result = await executeFinalScriptStep(input(step({ type: 'NONE' })), adapter);

    expect(result).toMatchObject({ success: true, cueId: CONFIRMATION_ID, command: null });
    expect(result.declarationId).toBeNull();
    expect(adapter.publishCue).toHaveBeenCalledWith(
      expect.objectContaining({ cueId: CONFIRMATION_ID, confirmationEntryId: CONFIRMATION_ID, text: 'START' }),
    );
    expect(adapter.openMatch).not.toHaveBeenCalled();
  });

  it('routes MATCH firing through the execution port after publishing its cue', async () => {
    const adapter = port();
    vi.mocked(adapter.openMatch).mockResolvedValue({
      commandId: '44444444-4444-4444-8444-444444444444',
      action: 'start-match',
      success: true,
      lanes: [],
    });
    const matchStep = step({
      type: 'OPEN_FIRING',
      purpose: 'MATCH',
      participantSelection: 'ALL_ACTIVE',
      durationSeconds: 250,
      shotsPerParticipant: 5,
      target: { stageId: 'match-series', stageIndex: 1, seriesIndex: 0 },
    });

    const result = await executeFinalScriptStep(input(matchStep), adapter);

    expect(adapter.publishCue).toHaveBeenCalledOnce();
    expect(adapter.openMatch).toHaveBeenCalledWith(matchStep, []);
    expect(result.success).toBe(true);
  });

  it('does not execute a state change if the retained cue cannot be published', async () => {
    const adapter = port();
    vi.mocked(adapter.publishCue).mockRejectedValue(new Error('broker unavailable'));

    await expect(
      executeFinalScriptStep(
        input(
          step({
            type: 'OPEN_FIRING',
            purpose: 'SIGHTING',
            participantSelection: 'ALL_ACTIVE',
            durationSeconds: 300,
          }),
        ),
        adapter,
      ),
    ).rejects.toThrow('broker unavailable');
    expect(adapter.openSighting).not.toHaveBeenCalled();
  });

  it('routes an officially selected timed-target series through its independent port', async () => {
    const laneId = '77777777-7777-4777-8777-777777777777';
    const adapter = port();
    vi.mocked(adapter.runTimedTarget).mockResolvedValue({
      commandId: '88888888-8888-4888-8888-888888888888',
      action: 'start-timed-target',
      success: true,
      lanes: [],
    });
    const timedStep = step({
      type: 'RUN_TIMED_TARGET',
      purpose: 'MATCH',
      participantSelection: 'OFFICIAL_SELECTED',
      requiredParticipantCount: 1,
      programId: 'RFPM_FINAL_MATCH_4',
      shotsPerParticipant: 5,
      target: { stageId: 'FINAL_SERIES', stageIndex: 1, seriesIndex: 3 },
    });

    const result = await executeFinalScriptStep({ ...input(timedStep), eligibleLaneIds: [laneId] }, adapter);

    expect(adapter.runTimedTarget).toHaveBeenCalledWith(timedStep, [], [laneId]);
    expect(result.success).toBe(true);
  });

  it('routes a tied-only timed-target shoot-off through the same transport-neutral port', async () => {
    const laneIds = ['77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888'];
    const adapter = port();
    vi.mocked(adapter.runTimedTarget).mockResolvedValue({
      commandId: '99999999-9999-4999-8999-999999999999',
      action: 'start-shoot-off',
      success: true,
      lanes: [],
    });
    const shootOffStep = step({
      type: 'RUN_TIMED_TARGET',
      purpose: 'SHOOT_OFF',
      participantSelection: 'TIED_ONLY',
      programId: 'RFPM_FINAL_SHOOT_OFF_4',
      shotsPerParticipant: 5,
      participantExecution: 'SEQUENTIAL',
      participantOrder: 'FINAL_START_NUMBER_ASCENDING',
    });

    const result = await executeFinalScriptStep(
      { ...input(shootOffStep), branch: 'SHOOT_OFF', iteration: 1, eligibleLaneIds: laneIds },
      adapter,
    );

    expect(adapter.runTimedTarget).toHaveBeenCalledWith(shootOffStep, [], laneIds);
    expect(adapter.openShootOff).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('durably declares results before publishing the RESULTS ARE FINAL cue', async () => {
    const calls: string[] = [];
    const adapter = port();
    vi.mocked(adapter.declareResults).mockImplementation(async () => {
      calls.push('declare');
      return { declarationId: DECLARATION_ID, replayed: false };
    });
    vi.mocked(adapter.publishCue).mockImplementation(async () => {
      calls.push('cue');
    });
    const declarationStep = {
      ...step({ type: 'DECLARE_RESULTS' }),
      kind: 'DECLARATION' as const,
      text: 'RESULTS ARE FINAL',
    };
    const executionInput = {
      ...input(declarationStep),
      declaration: {
        eventId: EVENT_ID,
        finalProtestsResolved: true as const,
        resultProcessConfirmed: true as const,
        statement: 'RESULTS ARE FINAL',
        officialName: 'CRO A',
      },
    };

    const result = await executeFinalScriptStep(executionInput, adapter);

    expect(calls).toEqual(['declare', 'cue']);
    expect(result).toMatchObject({ success: true, declarationId: DECLARATION_ID, command: null });
    expect(result.statement).toContain(`declaration ${DECLARATION_ID} recorded`);
  });

  it('never publishes a declaration cue without explicit confirmations', async () => {
    const adapter = port();
    const declarationStep = {
      ...step({ type: 'DECLARE_RESULTS' }),
      kind: 'DECLARATION' as const,
      text: 'RESULTS ARE FINAL',
    };

    await expect(executeFinalScriptStep(input(declarationStep), adapter)).rejects.toThrow(
      'requires explicit declaration confirmations',
    );
    expect(adapter.publishCue).not.toHaveBeenCalled();
    expect(adapter.declareResults).not.toHaveBeenCalled();
  });
});

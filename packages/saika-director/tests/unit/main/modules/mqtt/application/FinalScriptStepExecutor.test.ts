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
  };
}

function port(): FinalScriptStepExecutionPort {
  return {
    publishCue: vi.fn().mockResolvedValue(undefined),
    openSighting: vi.fn(),
    closeSighting: vi.fn(),
    openMatch: vi.fn(),
    closeMatch: vi.fn(),
    openShootOff: vi.fn(),
    closeShootOff: vi.fn(),
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
});

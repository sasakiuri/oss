// SPDX-License-Identifier: MIT
import { mqttService, rangeInterruptionsService } from '@/renderer/services';
import { unwrap } from '@/renderer/services/serviceError';
import type { RangeInterruptionCaseDto, CaseScopePayload } from '@/shared/ipc/contracts';

import { useCaseWorkspace, type CaseWorkspaceOptions } from '../shared/cases/useCaseWorkspace';

import type { RangeInterruptionCommands } from './interruptionPresentationTypes';
import { applyLaneMatchResume, applyLanePause, applyLaneResume } from './rangeInterruptionLaneWorkflow';
import { applyRangeMatchResume, applyRangePause, applyRangeResume } from './rangeInterruptionRangeWorkflow';

const workspaceOptions: CaseWorkspaceOptions<CaseScopePayload['scopeType'], RangeInterruptionCaseDto> = {
  list: async (scope) =>
    unwrap(scope ? await rangeInterruptionsService.listByScope(scope) : await rangeInterruptionsService.listAll()),
  isDefaultCandidate: (interruption) => interruption.status !== 'CLOSED' && interruption.status !== 'VOID',
  loadFailure: 'Failed to load range interruptions',
  mutationFailure: 'Failed to update the interruption record',
};

const workflowPorts = { lane: mqttService, ledger: rangeInterruptionsService };

/** Owns one scope's queries, selection, commands and mutation recovery. */
export function useRangeInterruptionCases(primaryScope?: CaseScopePayload) {
  const { cases, selectedCaseId, selectCase, selectedCase, loading, saving, error, loadCases, runMutation } =
    useCaseWorkspace(primaryScope, workspaceOptions);

  const commands: RangeInterruptionCommands = {
    create: (input) => runMutation(async () => unwrap(await rangeInterruptionsService.create(input))),
    appendEntry: (input) => runMutation(async () => unwrap(await rangeInterruptionsService.appendEntry(input))),
    linkScope: (input) => runMutation(async () => unwrap(await rangeInterruptionsService.linkScope(input))),
    recordTargetRecovery: (input) =>
      runMutation(async () => unwrap(await rangeInterruptionsService.recordTargetRecovery(input))),
    recordQualificationDecision: (input) =>
      runMutation(async () =>
        unwrap(await rangeInterruptionsService.recordQualificationTimedTargetRecoveryDecision(input)),
      ),
    startQualificationRecovery: (input) =>
      runMutation(async () => unwrap(await rangeInterruptionsService.startQualificationRecoveryExecution(input))),
    cancelQualificationRecovery: (input) =>
      runMutation(async () => unwrap(await rangeInterruptionsService.cancelQualificationRecoveryExecution(input))),
    adjudicateQualificationRecovery: (input) =>
      runMutation(async () => unwrap(await rangeInterruptionsService.adjudicateQualificationRecoveryExecution(input))),
    applyQualificationSettlement: (input) =>
      runMutation(async () => unwrap(await rangeInterruptionsService.applyQualificationRecoverySettlement(input))),
    pauseLane: (context) => runMutation(() => applyLanePause(context, workflowPorts)),
    resumeLane: (context) => runMutation(() => applyLaneResume(context, workflowPorts)),
    resumeLaneMatch: (context) => runMutation(() => applyLaneMatchResume(context, workflowPorts)),
    pauseRange: (context) => runMutation(() => applyRangePause(context, workflowPorts)),
    resumeRange: (context) => runMutation(() => applyRangeResume(context, workflowPorts)),
    resumeRangeMatch: (context) => runMutation(() => applyRangeMatchResume(context, workflowPorts)),
  };

  return {
    cases,
    selectedCaseId,
    selectCase,
    selectedCase,
    activeHolds: cases.filter((interruption) => interruption.dataHoldActive).length,
    loading,
    saving,
    error,
    loadCases,
    commands,
  };
}

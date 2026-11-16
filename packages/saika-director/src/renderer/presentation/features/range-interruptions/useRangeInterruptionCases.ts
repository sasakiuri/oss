// SPDX-License-Identifier: MIT
import { rangeInterruptionsService } from '@/renderer/services';
import { unwrap } from '@/renderer/services/serviceError';
import type { RangeInterruptionCaseDto, RangeInterruptionScopePayload } from '@/shared/ipc/contracts';

import { useCaseWorkspace, type CaseWorkspaceOptions } from '../shared/cases/useCaseWorkspace';

const workspaceOptions: CaseWorkspaceOptions<RangeInterruptionScopePayload['scopeType'], RangeInterruptionCaseDto> = {
  list: async (scope) =>
    unwrap(scope ? await rangeInterruptionsService.listByScope(scope) : await rangeInterruptionsService.listAll()),
  isDefaultCandidate: (interruption) => interruption.status !== 'CLOSED' && interruption.status !== 'VOID',
  loadFailure: 'Failed to load range interruptions',
  mutationFailure: 'Failed to update the interruption record',
};

/** Owns one scope's queries, selection and mutation recovery. */
export function useRangeInterruptionCases(primaryScope?: RangeInterruptionScopePayload) {
  const { cases, selectedCaseId, selectCase, selectedCase, loading, saving, error, loadCases, runMutation } =
    useCaseWorkspace(primaryScope, workspaceOptions);
  return {
    cases,
    selectedCaseId,
    setSelectedCaseId: selectCase,
    selectedCase,
    activeHolds: cases.filter((interruption) => interruption.dataHoldActive).length,
    loading,
    saving,
    error,
    loadCases,
    runMutation,
  };
}

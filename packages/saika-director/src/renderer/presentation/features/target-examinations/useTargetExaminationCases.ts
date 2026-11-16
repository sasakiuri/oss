import { targetExaminationsService } from '@/renderer/services';
import { unwrap } from '@/renderer/services/serviceError';
import type { TargetExaminationCaseDto, TargetExaminationScopePayload } from '@/shared/ipc/contracts';

import { useCaseWorkspace, type CaseWorkspaceOptions } from '../shared/cases/useCaseWorkspace';

import type { TargetExaminationCommands } from './examinationTypes';

const workspaceOptions: CaseWorkspaceOptions<TargetExaminationScopePayload['scopeType'], TargetExaminationCaseDto> = {
  list: async (scope) =>
    unwrap(scope ? await targetExaminationsService.listByScope(scope) : await targetExaminationsService.listAll()),
  isDefaultCandidate: (examination) => examination.status === 'OPEN',
  loadFailure: 'Failed to load examinations',
  mutationFailure: 'Failed to update the target examination',
};

/** Owns queries and commands for one workspace visit, independently of its forms. */
export function useTargetExaminationCases(primaryScope?: TargetExaminationScopePayload) {
  const { cases, selectedCaseId, selectCase, selectedCase, loading, saving, error, loadCases, runMutation } =
    useCaseWorkspace(primaryScope, workspaceOptions);

  const commands: TargetExaminationCommands = {
    create: (input) => runMutation(async () => unwrap(await targetExaminationsService.create(input))),
    addEvidence: (input) => runMutation(async () => unwrap(await targetExaminationsService.addEvidence(input))),
    appendEntry: (input) => runMutation(async () => unwrap(await targetExaminationsService.appendEntry(input))),
    linkScope: (input) => runMutation(async () => unwrap(await targetExaminationsService.linkScope(input))),
  };

  return {
    cases,
    selectedCaseId,
    selectCase,
    selectedCase,
    activeHolds: cases.filter((examination) => examination.evidenceHoldActive).length,
    loading,
    saving,
    error,
    loadCases,
    commands,
  };
}

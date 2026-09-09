import { useCallback, useEffect, useMemo, useState } from 'react';

import { targetExaminationsService } from '@/renderer/services';
import type { TargetExaminationCaseDto, TargetExaminationScopePayload } from '@/shared/ipc/contracts';

import type { TargetExaminationCommands } from './examinationTypes';

/** Owns queries and commands for one workspace visit, independently of its forms. */
export function useTargetExaminationCases(primaryScope?: TargetExaminationScopePayload) {
  const [cases, setCases] = useState<TargetExaminationCaseDto[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopeType = primaryScope?.scopeType;
  const scopeId = primaryScope?.scopeId;
  const lifetime = useMemo(
    () => ({ active: false, generation: 0, requestId: 0, mutating: false, selectionVersion: 0 }),
    [scopeType, scopeId],
  );

  const loadCases = useCallback(async () => {
    if (!lifetime.active) return;
    const requestId = ++lifetime.requestId;
    const isCurrent = () => lifetime.active && requestId === lifetime.requestId;
    setLoading(true);
    setError(null);
    try {
      const response =
        scopeType !== undefined && scopeId !== undefined
          ? await targetExaminationsService.listByScope({ scopeType, scopeId })
          : await targetExaminationsService.listAll();
      if (!response.success) throw new Error(response.error.message);
      if (!isCurrent()) return;
      setCases(response.data);
      setSelectedCaseId((current) => {
        if (current && response.data.some((examination) => examination.id === current)) return current;
        return (
          [...response.data].reverse().find((examination) => examination.status === 'OPEN')?.id ??
          response.data.at(-1)?.id ??
          null
        );
      });
    } catch (caught) {
      if (isCurrent()) setError(errorMessage(caught, 'Failed to load examinations'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [lifetime, scopeType, scopeId]);

  useEffect(() => {
    lifetime.active = true;
    lifetime.generation += 1;
    lifetime.mutating = false;
    setCases([]);
    setSelectedCaseId(null);
    setSaving(false);
    void loadCases();
    return () => {
      lifetime.active = false;
      lifetime.generation += 1;
      lifetime.requestId += 1;
    };
  }, [lifetime, loadCases]);

  const selectCase = (caseId: string) => {
    lifetime.selectionVersion += 1;
    setSelectedCaseId(caseId);
  };

  const runMutation = useCallback(
    async (operation: () => ReturnType<typeof targetExaminationsService.create>): Promise<boolean> => {
      if (!lifetime.active || lifetime.mutating) return false;
      lifetime.mutating = true;
      lifetime.requestId += 1;
      const generation = lifetime.generation;
      const selectionVersion = lifetime.selectionVersion;
      const isCurrent = () => lifetime.active && generation === lifetime.generation;
      setSaving(true);
      setError(null);
      try {
        const response = await operation();
        if (!response.success) throw new Error(response.error.message);
        if (!isCurrent()) return false;
        // A completed command must not undo a selection made while it was pending.
        if (selectionVersion === lifetime.selectionVersion) setSelectedCaseId(response.data.id);
        await loadCases();
        return isCurrent();
      } catch (caught) {
        if (!isCurrent()) return false;
        // Refresh after an uncertain command outcome without discarding the form draft.
        const message = errorMessage(caught, 'Failed to update the target examination');
        await loadCases();
        if (isCurrent()) setError(message);
        return false;
      } finally {
        if (isCurrent()) {
          lifetime.mutating = false;
          setSaving(false);
        }
      }
    },
    [lifetime, loadCases],
  );

  const commands: TargetExaminationCommands = {
    create: (input) => runMutation(() => targetExaminationsService.create(input)),
    addEvidence: (input) => runMutation(() => targetExaminationsService.addEvidence(input)),
    appendEntry: (input) => runMutation(() => targetExaminationsService.appendEntry(input)),
    linkScope: (input) => runMutation(() => targetExaminationsService.linkScope(input)),
  };

  return {
    cases,
    selectedCaseId,
    selectCase,
    selectedCase: cases.find((examination) => examination.id === selectedCaseId) ?? null,
    activeHolds: cases.filter((examination) => examination.evidenceHoldActive).length,
    loading,
    saving,
    error,
    loadCases,
    commands,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

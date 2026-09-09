// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useState } from 'react';

import { rangeInterruptionsService } from '@/renderer/services';
import type { RangeInterruptionCaseDto, RangeInterruptionScopePayload } from '@/shared/ipc/contracts';

/** Owns one scope's queries, selection and mutation recovery. */
export function useRangeInterruptionCases(primaryScope?: RangeInterruptionScopePayload) {
  const [cases, setCases] = useState<RangeInterruptionCaseDto[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopeType = primaryScope?.scopeType;
  const scopeId = primaryScope?.scopeId;
  // Identity distinguishes separate visits to the same scope (A -> B -> A).
  const lifetime = useMemo(() => ({ active: false, requestId: 0, mutating: false }), [scopeType, scopeId]);

  const loadCases = useCallback(async () => {
    if (!lifetime.active) return;
    const requestId = ++lifetime.requestId;
    const isCurrent = () => lifetime.active && requestId === lifetime.requestId;
    setLoading(true);
    setError(null);
    try {
      const response =
        scopeType !== undefined && scopeId !== undefined
          ? await rangeInterruptionsService.listByScope({ scopeType, scopeId })
          : await rangeInterruptionsService.listAll();
      if (!response.success) throw new Error(response.error.message);
      if (!isCurrent()) return;
      setCases(response.data);
      setSelectedCaseId((current) => {
        if (current && response.data.some((interruption) => interruption.id === current)) return current;
        return (
          [...response.data]
            .reverse()
            .find((interruption) => interruption.status !== 'CLOSED' && interruption.status !== 'VOID')?.id ??
          response.data.at(-1)?.id ??
          null
        );
      });
    } catch (caught) {
      if (isCurrent()) setError(errorMessage(caught, 'Failed to load range interruptions'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [lifetime, scopeType, scopeId]);

  useEffect(() => {
    lifetime.active = true;
    setCases([]);
    setSelectedCaseId(null);
    setSaving(false);
    void loadCases();
    return () => {
      lifetime.active = false;
      lifetime.requestId += 1;
    };
  }, [lifetime, loadCases]);

  const runMutation = useCallback(
    async (operation: () => Promise<RangeInterruptionCaseDto>): Promise<boolean> => {
      if (!lifetime.active || lifetime.mutating) return false;
      lifetime.mutating = true;
      lifetime.requestId += 1;
      setSaving(true);
      setError(null);
      try {
        const interruption = await operation();
        if (!lifetime.active) return false;
        setSelectedCaseId(interruption.id);
        await loadCases();
        return lifetime.active;
      } catch (caught) {
        if (!lifetime.active) return false;
        const message = errorMessage(caught, 'Failed to update the interruption record');
        // A Lane command and a ledger append cannot share a transaction. Reload
        // before retrying in case only the acknowledgement was lost.
        await loadCases();
        if (lifetime.active) setError(message);
        return false;
      } finally {
        lifetime.mutating = false;
        if (lifetime.active) setSaving(false);
      }
    },
    [lifetime, loadCases],
  );

  const selectedCase = cases.find((interruption) => interruption.id === selectedCaseId) ?? null;
  const activeHolds = cases.filter((interruption) => interruption.dataHoldActive).length;
  return {
    cases,
    selectedCaseId,
    setSelectedCaseId,
    selectedCase,
    activeHolds,
    loading,
    saving,
    error,
    loadCases,
    runMutation,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

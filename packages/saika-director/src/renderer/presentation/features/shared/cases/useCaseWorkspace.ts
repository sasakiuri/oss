import { useCallback, useEffect, useMemo, useState } from 'react';

import { errorMessage } from '@/renderer/services/serviceError';

export interface CaseWorkspaceScope<TScopeType extends string> {
  readonly scopeType: TScopeType;
  readonly scopeId: string;
}

/** What differs between case workspaces. Pass a module constant: the workspace expects it never to change. */
export interface CaseWorkspaceOptions<TScopeType extends string, TCase extends { readonly id: string }> {
  /** Lists the cases of one scope, or every case without a scope. Throws on failure. */
  readonly list: (scope: CaseWorkspaceScope<TScopeType> | undefined) => Promise<TCase[]>;
  /** Cases the workspace selects by default: the newest such case, else the newest case. */
  readonly isDefaultCandidate: (record: TCase) => boolean;
  /** Error text when a query rejects with a value that is not an `Error`. */
  readonly loadFailure: string;
  /** Error text when a command rejects with a value that is not an `Error`. */
  readonly mutationFailure: string;
}

/**
 * Owns one scope's case list, selection, queries and command recovery.
 *
 * Each scope visit has its own lifetime: responses and commands of an earlier visit (A -> B -> A) or an
 * unmounted panel are ignored, and only the newest query updates the list. A lifetime is reactivated only by the
 * development-only Strict Mode remount, which happens before any command can start.
 */
export function useCaseWorkspace<TScopeType extends string, TCase extends { readonly id: string }>(
  scope: CaseWorkspaceScope<TScopeType> | undefined,
  options: CaseWorkspaceOptions<TScopeType, TCase>,
) {
  const [cases, setCases] = useState<TCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopeType = scope?.scopeType;
  const scopeId = scope?.scopeId;
  // Identity distinguishes separate visits to the same scope (A -> B -> A).
  const lifetime = useMemo(
    () => ({ active: false, requestId: 0, mutating: false, selectionVersion: 0 }),
    [scopeType, scopeId],
  );

  const loadCases = useCallback(async () => {
    if (!lifetime.active) return;
    const requestId = ++lifetime.requestId;
    const isCurrent = () => lifetime.active && requestId === lifetime.requestId;
    setLoading(true);
    setError(null);
    try {
      const listed = await options.list(
        scopeType !== undefined && scopeId !== undefined ? { scopeType, scopeId } : undefined,
      );
      if (!isCurrent()) return;
      setCases(listed);
      setSelectedCaseId((current) => {
        if (current && listed.some((record) => record.id === current)) return current;
        return (
          [...listed].reverse().find((record) => options.isDefaultCandidate(record))?.id ?? listed.at(-1)?.id ?? null
        );
      });
    } catch (caught) {
      if (isCurrent()) setError(errorMessage(caught, options.loadFailure));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [lifetime, options, scopeType, scopeId]);

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

  const selectCase = useCallback(
    (caseId: string) => {
      lifetime.selectionVersion += 1;
      setSelectedCaseId(caseId);
    },
    [lifetime],
  );

  /** Runs one command at a time and reloads afterwards. Resolves `true` when it succeeded on this visit. */
  const runMutation = useCallback(
    async (operation: () => Promise<TCase>): Promise<boolean> => {
      if (!lifetime.active || lifetime.mutating) return false;
      lifetime.mutating = true;
      lifetime.requestId += 1;
      const selectionVersion = lifetime.selectionVersion;
      setSaving(true);
      setError(null);
      try {
        const changed = await operation();
        if (!lifetime.active) return false;
        // A completed command must not undo a selection made while it was pending.
        if (selectionVersion === lifetime.selectionVersion) setSelectedCaseId(changed.id);
        await loadCases();
        return lifetime.active;
      } catch (caught) {
        if (!lifetime.active) return false;
        const message = errorMessage(caught, options.mutationFailure);
        // The command may have been recorded although its response was lost (a Lane command and a ledger append
        // cannot share a transaction). Reload before exposing the error; the form keeps its draft for a retry.
        await loadCases();
        if (lifetime.active) setError(message);
        return false;
      } finally {
        lifetime.mutating = false;
        if (lifetime.active) setSaving(false);
      }
    },
    [lifetime, loadCases, options],
  );

  return {
    cases,
    selectedCaseId,
    selectCase,
    selectedCase: cases.find((record) => record.id === selectedCaseId) ?? null,
    loading,
    saving,
    error,
    loadCases,
    runMutation,
  };
}

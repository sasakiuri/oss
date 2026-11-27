import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { resultVerificationService } from '@/renderer/services';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import type {
  AddVerificationCheckPayload,
  ApproveResultListPayload,
  ResultScope,
  ResultVerificationStatusDto,
  RevokeResultListApprovalPayload,
} from '@/shared/ipc/contracts';

/**
 * Result verification commands. Each reloads the status after it succeeded; `onSaved` runs before the reload and lets
 * a form clear its draft. Each resolves `true` when the command succeeded.
 */
export interface ResultVerificationCommands {
  addCheck: (input: AddVerificationCheckPayload) => Promise<boolean>;
  approve: (input: ApproveResultListPayload, onSaved: () => void) => Promise<boolean>;
  revokeApproval: (input: RevokeResultListApprovalPayload, onSaved: () => void) => Promise<boolean>;
}

/**
 * Owns the verification status of one result list, the selected result (by default the first required result that
 * has no qualifying check) and the commands. One busy flag and one error cover the commands; a query clears the error.
 */
export function useResultVerification(eventId: string, resultScope: ResultScope) {
  const [status, setStatus] = useState<ResultVerificationStatusDto | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { busy: saving, error, setError, run } = useAsyncAction();

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = unwrap(await resultVerificationService.getStatus({ eventId, resultScope }));
      setStatus(loaded);
      setSelectedResultId((current) => {
        if (current && loaded.results.some((result) => result.resultId === current)) return current;
        return (
          loaded.results.find((result) => result.required && !result.currentCheck?.qualifies)?.resultId ??
          loaded.results.find((result) => result.required)?.resultId ??
          null
        );
      });
    } catch (caught) {
      setError(errorMessage(caught, 'Failed to load result verification status'));
    } finally {
      setLoading(false);
    }
  }, [eventId, resultScope, setError]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const requiredResults = useMemo(() => status?.results.filter((result) => result.required) ?? [], [status]);
  const selectedResult = useMemo(
    () => status?.results.find((result) => result.resultId === selectedResultId) ?? null,
    [selectedResultId, status],
  );

  const commands: ResultVerificationCommands = {
    addCheck: (input) =>
      run(async () => {
        unwrap(await resultVerificationService.addCheck(input));
        await loadStatus();
      }, 'Failed to append the verification check'),
    approve: (input, onSaved) =>
      run(async () => {
        unwrap(await resultVerificationService.approve(input));
        onSaved();
        await loadStatus();
      }, 'Failed to approve the result list'),
    revokeApproval: (input, onSaved) =>
      run(async () => {
        unwrap(await resultVerificationService.revokeApproval(input));
        onSaved();
        await loadStatus();
      }, 'Failed to revoke the result-list approval'),
  };

  return {
    status,
    requiredResults,
    selectedResult,
    selectResult: setSelectedResultId,
    loading,
    saving,
    error,
    loadStatus,
    commands,
  };
}

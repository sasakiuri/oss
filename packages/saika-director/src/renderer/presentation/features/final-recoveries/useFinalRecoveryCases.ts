import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { finalOperationsService, finalRecoveriesService } from '@/renderer/services';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import type { FinalOperationRunDto, FinalRecoveryCaseDto } from '@/shared/ipc/contracts';

import type { FinalRecoveryCommands } from './finalRecoveryCommands';

/**
 * Owns a competition's Final recovery cases and its Final run: the queries, the selection (the newest case unless the
 * selected one is still listed) and the commands. A command updates the case in the list without querying again.
 */
export function useFinalRecoveryCases(competitionId: string) {
  const [cases, setCases] = useState<FinalRecoveryCaseDto[]>([]);
  const [run, setRun] = useState<FinalOperationRunDto | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const { busy: saving, error, setError, run: runCommand } = useAsyncAction();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [caseResponse, runResponse] = await Promise.all([
        finalRecoveriesService.listByCompetition({ competitionId }),
        finalOperationsService.getByCompetition({ competitionId }),
      ]);
      const listed = unwrap(caseResponse);
      const currentRun = unwrap(runResponse);
      setCases(listed);
      setRun(currentRun);
      setSelectedId((current) => (listed.some((value) => value.id === current) ? current : (listed.at(-1)?.id ?? '')));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [competitionId, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => cases.find((value) => value.id === selectedId) ?? null, [cases, selectedId]);

  const replaceCase = (value: FinalRecoveryCaseDto) => {
    setCases((current) => current.map((candidate) => (candidate.id === value.id ? value : candidate)));
    setSelectedId(value.id);
  };

  const commands: FinalRecoveryCommands = {
    create: (payload, onSaved) =>
      runCommand(async () => {
        const created = unwrap(await finalRecoveriesService.create(payload));
        setCases((current) => [...current, created]);
        setSelectedId(created.id);
        onSaved();
      }),
    bindAllowanceSubject: (payload) =>
      runCommand(async () => {
        replaceCase(unwrap(await finalRecoveriesService.bindAllowanceSubject(payload)));
      }),
    appendEntry: (payload, onSaved) =>
      runCommand(async () => {
        replaceCase(unwrap(await finalRecoveriesService.appendEntry(payload)));
        onSaved();
      }),
  };

  return { cases, run, selectedId, setSelectedId, selected, loading, saving, error, load, commands };
}

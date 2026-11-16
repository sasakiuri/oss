import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { qualificationMalfunctionsService } from '@/renderer/services';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import type {
  AppendQualificationMalfunctionEntryPayload,
  CreateQualificationMalfunctionCasePayload,
  QualificationMalfunctionCaseDto,
} from '@/shared/ipc/contracts';

/**
 * Commands of the malfunction workspace. One busy flag and one error cover the query and every command. `onSaved`
 * runs after the list shows the saved case and before the busy flag clears; it lets a form clear its draft. Each
 * resolves `true` when the command succeeded.
 */
export interface QualificationMalfunctionCommands {
  readonly create: (payload: CreateQualificationMalfunctionCasePayload, onSaved: () => void) => Promise<boolean>;
  readonly appendEntry: (payload: AppendQualificationMalfunctionEntryPayload, onSaved: () => void) => Promise<boolean>;
}

/**
 * Owns a competition's malfunction cases: the query, the selection (the newest case unless the selected one is still
 * listed) and the commands. A command updates the case in the list without querying again.
 */
export function useQualificationMalfunctionCases(competitionId: string) {
  const [cases, setCases] = useState<QualificationMalfunctionCaseDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const { busy: saving, error, setError, run } = useAsyncAction();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const listed = unwrap(await qualificationMalfunctionsService.listByCompetition({ competitionId }));
      setCases(listed);
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
  const linkedSignalIds = useMemo(
    () => new Set(cases.flatMap((value) => (value.sourceSignalId ? [value.sourceSignalId] : []))),
    [cases],
  );
  const replaceCase = (value: QualificationMalfunctionCaseDto) => {
    setCases((current) => current.map((candidate) => (candidate.id === value.id ? value : candidate)));
    setSelectedId(value.id);
  };

  const commands: QualificationMalfunctionCommands = {
    create: (payload, onSaved) =>
      run(async () => {
        const created = unwrap(await qualificationMalfunctionsService.create(payload));
        setCases((current) => [...current, created]);
        setSelectedId(created.id);
        onSaved();
      }),
    appendEntry: (payload, onSaved) =>
      run(async () => {
        replaceCase(unwrap(await qualificationMalfunctionsService.appendEntry(payload)));
        onSaved();
      }),
  };

  return {
    cases,
    selectedId,
    setSelectedId,
    selected,
    linkedSignalIds,
    loading,
    saving,
    error,
    load,
    replaceCase,
    commands,
  };
}

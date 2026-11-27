// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';

import type { ScreenConfig, ScreenStatus } from '../../shared/model';

import type { Run } from './types';

/**
 * The screen editor's draft. Fields the operator edits survive refreshes of the saved screen until
 * they are applied; the other fields follow the saved screen.
 */
export function useScreenDraft({
  initial,
  status,
  dirty,
  onDirtyChange,
  run,
  nodeId,
}: {
  initial: ScreenConfig;
  status?: ScreenStatus;
  dirty: boolean;
  onDirtyChange: (dirty: boolean) => void;
  run: Run;
  nodeId: string;
}) {
  const [draft, setDraft] = useState(initial);
  const editedFields = useRef(new Set<keyof ScreenConfig>());
  const persistedStandby = useRef(status?.config.standby);
  const [requested, setRequested] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!status) return;
    // A completed toolbar standby action supersedes earlier edits to this field.
    if (status.config.standby !== persistedStandby.current) editedFields.current.delete('standby');
    persistedStandby.current = status.config.standby;
    setDraft((current) => {
      const edits = Object.fromEntries([...editedFields.current].map((key) => [key, current[key]]));
      return { ...status.config, ...edits };
    });
  }, [status?.config.revision, dirty]);
  const change = (changes: Partial<ScreenConfig>) => {
    for (const key of Object.keys(changes) as Array<keyof ScreenConfig>) editedFields.current.add(key);
    setDraft((current) => ({ ...current, ...changes }));
    onDirtyChange(true);
    setMessage('');
  };
  /** Sends the draft as the screen's next revision. */
  const apply = async () => {
    const config = { ...draft, name: draft.name.trim(), revision: (status?.config.revision ?? 0) + 1 };
    setRequested(config.revision);
    setApplying(true);
    if (await run({ type: 'apply', nodeId, config })) {
      editedFields.current.clear();
      setDraft(config);
      onDirtyChange(false);
      setMessage('Settings sent.');
    } else setMessage('Your draft is retained. Check the error before applying again.');
    setApplying(false);
  };
  return { draft, change, apply, requested, applying, message };
}

/** Applies edited fields to the draft. */
export type ChangeDraft = ReturnType<typeof useScreenDraft>['change'];

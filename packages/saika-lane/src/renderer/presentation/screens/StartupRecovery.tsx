// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { FinishSavedRun } from '@/renderer/presentation/components/FinishSavedRun';
import { ModeSwitchConfirmation } from '@/renderer/presentation/components/ModeSwitchConfirmation';
import { SettingsModal } from '@/renderer/presentation/components/SettingsModal';
import { useDirectorMembershipStore } from '@/renderer/presentation/stores/directorMembershipStore';
import { competitionService } from '@/renderer/services/competitionService';
import { createVoidServiceMethod } from '@/renderer/services/createServiceMethod';
import { settingsService } from '@/renderer/services/settingsService';
import type { StartupStateDto } from '@/shared/ipc/contracts';

export function StartupRecovery({ state, onRetry }: { state: StartupStateDto; onRetry: () => Promise<void> }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [setAsideConfirmation, setSetAsideConfirmation] = useState(false);
  const [types, setTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [typeId, setTypeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!state.canChooseType) return;
    let cancelled = false;
    void competitionService
      .getCompetitionTypes()
      .then((available) => {
        if (!cancelled) {
          setTypes(available);
          setTypeId(available[0]?.id ?? '');
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [state.canChooseType]);
  const setAside = async () => {
    setSetAsideConfirmation(false);
    setBusy(true);
    try {
      await createVoidServiceMethod(() => window.electronAPI.startup.setAsideSavedRun())();
      await onRetry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    setBusy(true);
    try {
      await competitionService.startCompetition({ competitionTypeId: typeId });
      await settingsService.saveUserPreferences({ competitionTypeId: typeId });
      await onRetry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const membership = useDirectorMembershipStore((value) => value.membership);
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-5 bg-zinc-900 p-12 text-white">
      <h1 className="text-3xl font-semibold">Saved run needs attention</h1>
      <p role="alert" className="max-w-2xl text-center">
        {state.error}
      </p>
      {error && <p role="alert">{error}</p>}
      <p>
        Competition: {state.competitionId ?? 'unavailable'} / Session: {state.sessionId ?? 'unavailable'}
      </p>
      <button type="button" className="rounded bg-blue-700 px-4 py-2" onClick={() => void onRetry()}>
        Retry
      </button>
      {state.canFinish && state.competitionId && membership?.competitionId === null && (
        <FinishSavedRun competitionId={state.competitionId} onFinished={onRetry} />
      )}
      {state.canSetAside && membership?.competitionId === null && (
        <>
          <button type="button" disabled={busy} onClick={() => setSetAsideConfirmation(true)}>
            Set aside saved run
          </button>
          <ModeSwitchConfirmation
            message={
              setAsideConfirmation
                ? 'Set aside the saved run? Only its active reference will be cleared. Saved competitions, sessions and shots will be preserved.'
                : null
            }
            onConfirm={setAside}
            onCancel={() => setSetAsideConfirmation(false)}
          />
        </>
      )}
      {state.canChooseType && membership?.competitionId === null && (
        <div className="flex gap-3">
          <label>
            Competition type{' '}
            <select
              aria-label="Competition type"
              value={typeId}
              onChange={(event) => setTypeId(event.target.value)}
              className="bg-zinc-800"
            >
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy || !typeId} onClick={() => void create()}>
            Create competition
          </button>
        </div>
      )}
      <button type="button" onClick={() => setSettingsOpen(true)}>
        MQTT settings
      </button>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} initialTab="mqtt" />
    </main>
  );
}

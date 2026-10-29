// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { FinishSavedRun } from '@/renderer/presentation/components/FinishSavedRun';
import { SettingsModal } from '@/renderer/presentation/components/SettingsModal';
import { useDirectorMembershipStore } from '@/renderer/presentation/stores/directorMembershipStore';
import type { StartupStateDto } from '@/shared/ipc/contracts';

export function StartupRecovery({ state, onRetry }: { state: StartupStateDto; onRetry: () => Promise<void> }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const membership = useDirectorMembershipStore((value) => value.membership);
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-5 bg-zinc-900 p-12 text-white">
      <h1 className="text-3xl font-semibold">Saved run needs attention</h1>
      <p role="alert" className="max-w-2xl text-center">
        {state.error}
      </p>
      <p>
        Competition: {state.competitionId ?? 'unavailable'} / Session: {state.sessionId ?? 'unavailable'}
      </p>
      <button type="button" className="rounded bg-blue-700 px-4 py-2" onClick={() => void onRetry()}>
        Retry
      </button>
      {state.canFinish && state.competitionId && membership?.competitionId === null && (
        <FinishSavedRun competitionId={state.competitionId} onFinished={onRetry} />
      )}
      <button type="button" onClick={() => setSettingsOpen(true)}>
        MQTT settings
      </button>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} initialTab="mqtt" />
    </main>
  );
}

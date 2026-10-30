// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { competitionService } from '@/renderer/services/competitionService';

import { ModeSwitchConfirmation } from './ModeSwitchConfirmation';

export function FinishSavedRun({
  competitionId,
  onFinished,
}: {
  competitionId: string;
  onFinished: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finish = async () => {
    setConfirming(false);
    setBusy(true);
    try {
      await competitionService.finishCompetition({ competitionId });
      await onFinished();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(true)}
        className="rounded bg-red-800 px-4 py-2 text-white disabled:opacity-50"
      >
        Finish saved run
      </button>
      {error && <p role="alert">{error}</p>}
      <ModeSwitchConfirmation
        message={confirming ? 'Finish the saved run? Recorded shots will be preserved.' : null}
        onConfirm={finish}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { errorMessage } from '@/renderer/presentation/utils/errorMessage';
import { vistaService } from '@/renderer/services/vistaService';
import type { LaneVistaStatus } from '@/shared/ipc/contracts/vista.contract';

export function VistaSettingsPanel() {
  const [status, setStatus] = useState<LaneVistaStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    vistaService.getStatus().then(setStatus, (cause: unknown) => setError(errorMessage(cause)));
  }, []);
  const update = async (change: () => Promise<LaneVistaStatus>) => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await change());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const toggle = () => update(() => vistaService.setEnabled({ enabled: !status?.enabled }));
  const resetPairing = () => update(() => vistaService.resetPairing({}));
  return (
    <section className="space-y-3 border-t border-zinc-700 p-4 text-sm text-zinc-200" aria-label="Saika Vista sharing">
      <h3 className="font-semibold">Saika Vista</h3>
      <p>
        Share targets and scores with spectator screens on this network. Start a standard competition in Lane, then
        select this device in Vista.
      </p>
      <button
        type="button"
        disabled={!status || busy}
        onClick={() => void toggle()}
        className="rounded bg-blue-600 px-3 py-2 disabled:opacity-50"
      >
        {status?.enabled ? 'Disable sharing' : 'Enable sharing'}
      </button>
      <button
        type="button"
        disabled={!status || busy}
        onClick={() => void resetPairing()}
        className="rounded border border-zinc-600 px-3 py-2 disabled:opacity-50"
      >
        Reset pairing
      </button>
      <p className="text-xs text-zinc-400">
        Reset pairing revokes access for previously paired Vista PCs. Reconnect using the new secret.
      </p>
      {status?.enabled && (
        <>
          <p>Endpoint</p>
          <div className="break-all font-mono text-xs">
            {status.endpoints.map((endpoint) => (
              <div key={endpoint}>{endpoint}</div>
            ))}
          </div>
          <label className="block">
            Pairing secret
            <input
              className="mt-1 w-full rounded bg-zinc-950 p-2 font-mono text-xs"
              aria-label="Vista pairing secret"
              readOnly
              value={status.secret}
            />
          </label>
          <p className="text-xs text-zinc-400">
            Enter this secret on the Vista operator PC. No MQTT broker is required.
          </p>
        </>
      )}
      {(error || status?.error) && (
        <p role="alert" className="text-red-400">
          {error || status?.error}
        </p>
      )}
    </section>
  );
}

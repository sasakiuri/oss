// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { vistaService } from '@/renderer/services';
import type { VistaSettingsDto } from '@/shared/ipc/contracts/vista.contract';
import { Button } from '../shared/common/Button';

export function VistaSettingsPanel() {
  const [settings, setSettings] = useState<VistaSettingsDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    let disposed = false;
    void vistaService
      .getSettings()
      .then((response) => {
        if (!response.success) throw new Error(response.error.message);
        if (!disposed) setSettings(response.data);
      })
      .catch((caught: unknown) => {
        if (!disposed) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      disposed = true;
    };
  }, []);
  const save = async () => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      const response = await vistaService.setSettings({ enabled: settings.enabled, port: settings.port });
      if (!response.success) throw new Error(response.error.message);
      setSettings(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Saika Vista" className="mt-6 space-y-3 border-t border-vscode-border py-4">
      <h3 className="text-sm font-semibold">Saika Vista spectator displays</h3>
      <p className="text-xs text-vscode-text-muted">
        Enable encrypted, read-only access to this Director on the venue network. Enter the pairing secret on the Vista
        operator PC, then select the competition to display.
      </p>
      {error && (
        <p role="alert" className="text-xs text-vscode-error">
          {error}
        </p>
      )}
      {settings && (
        <fieldset disabled={busy} className="space-y-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
            />
            Enable Vista sharing
          </label>
          <label className="flex items-center gap-2">
            Network port
            <input
              aria-label="Vista network port"
              className="rounded border border-vscode-border bg-vscode-bg p-2"
              type="number"
              min={1}
              max={65535}
              value={settings.port}
              onChange={(event) => setSettings({ ...settings, port: Number(event.target.value) })}
            />
          </label>
          <Button
            onClick={() => void save()}
            disabled={busy || !Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535}
          >
            {busy ? 'Applying…' : 'Apply Vista settings'}
          </Button>
          <p role="status">{settings.running ? 'Sharing enabled' : 'Sharing stopped'}</p>
          {settings.error && <p role="alert">{settings.error}</p>}
          {settings.endpoints.map((endpoint) => (
            <p key={endpoint} className="break-all font-mono">
              {endpoint}
            </p>
          ))}
          <p className="break-all">Source ID: {settings.sourceId}</p>
          <label className="block">
            Pairing secret
            <input
              aria-label="Vista pairing secret"
              readOnly
              type={reveal ? 'text' : 'password'}
              value={settings.pairingSecret}
              className="mt-1 block w-full rounded border border-vscode-border bg-vscode-bg p-2 font-mono"
            />
          </label>
          <button className="underline" type="button" onClick={() => setReveal(!reveal)}>
            {reveal ? 'Hide pairing secret' : 'Show pairing secret'}
          </button>
        </fieldset>
      )}
    </section>
  );
}

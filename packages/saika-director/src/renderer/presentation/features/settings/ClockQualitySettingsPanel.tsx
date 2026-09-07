import { useEffect, useState } from 'react';

import { mqttService } from '@/renderer/services';
import { ClockQualitySettingsSchema, type ClockQualitySettingsDto } from '@/shared/ipc/contracts/mqtt.contract';

import { Button } from '../shared/common/Button';

const tolerances = [
  ['maxAbsoluteOffsetMilliseconds', 'Maximum clock offset (ms)'],
  ['maxUncertaintyMilliseconds', 'Maximum measurement uncertainty (ms)'],
  ['maxSampleAgeMilliseconds', 'Maximum sample age (ms)'],
] as const;

export function ClockQualitySettingsPanel() {
  const [settings, setSettings] = useState<ClockQualitySettingsDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    void mqttService
      .getClockQualitySettings()
      .then((response) => {
        if (disposed) return;
        if (response.success) setSettings(response.data);
        else setError(response.error.message);
      })
      .catch((caught: unknown) => {
        if (!disposed) setError(String(caught));
      });
    return () => {
      disposed = true;
    };
  }, []);

  const save = async () => {
    const parsed = ClockQualitySettingsSchema.safeParse(settings);
    if (!parsed.success) {
      setError('Enter positive whole numbers for clock tolerances.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await mqttService.setClockQualitySettings(parsed.data);
      if (!response.success) throw new Error(response.error.message);
      setSettings(response.data);
      setMessage('Clock policy saved. Probe the Lanes again before timed commands in Required mode.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Clock quality" className="mt-6 space-y-3 border-t border-vscode-border py-4">
      <h3 className="text-sm font-semibold text-vscode-text">Clock quality</h3>
      <p className="text-xs text-vscode-text-muted">
        Required mode blocks timed commands when a Lane has no fresh measurement within these tolerances. Advisory mode
        retains diagnostics and allows commands. These are installation tolerances, not target exposure timings.
      </p>
      {error && (
        <p role="alert" className="text-xs text-vscode-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-xs text-vscode-success">
          {message}
        </p>
      )}
      {settings && (
        <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
          <label className="text-xs">
            Clock policy
            <select
              className={inputClass}
              value={settings.mode}
              onChange={(event) =>
                setSettings({ ...settings, mode: event.target.value as ClockQualitySettingsDto['mode'] })
              }
            >
              <option value="ADVISORY">Advisory</option>
              <option value="REQUIRED">Required</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </label>
          {tolerances.map(([key, label]) => (
            <label key={key} className="text-xs">
              {label}
              <input
                className={inputClass}
                type="number"
                min={1}
                step={1}
                value={settings[key] || ''}
                onChange={(event) => setSettings({ ...settings, [key]: Number(event.target.value) })}
              />
            </label>
          ))}
        </fieldset>
      )}
      <Button disabled={busy || !settings} size="sm" onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save clock policy'}
      </Button>
    </section>
  );
}
const inputClass = 'mt-1 block min-h-8 w-full border border-vscode-border bg-vscode-input px-2 py-1 text-vscode-text';

// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { timedTargetService } from '@/renderer/services/timedTargetService';
import type { TimedTargetTimingSettings } from '@/shared/mqtt/TimedTargetTimingSettings';

import { TimingProfilesPanel } from './TimingProfilesPanel';

export function ShotTimingSettingsPanel() {
  const [settings, setSettings] = useState<TimedTargetTimingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profileGeneration, setProfileGeneration] = useState(0);
  useEffect(() => {
    let mounted = true;
    void timedTargetService
      .getTimingSettings()
      .then((value) => {
        if (mounted) setSettings(value);
      })
      .catch((caught: unknown) => {
        if (mounted) setError(String(caught));
      });
    return () => {
      mounted = false;
    };
  }, []);
  const save = async () => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      setSettings(await timedTargetService.setTimingSettings(settings));
      setSaved(true);
      setProfileGeneration((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Shot timing" className="space-y-3 border-t border-zinc-700 p-4 text-sm">
      <h3 className="font-semibold text-zinc-100">Shot timing</h3>
      <p className="text-zinc-400">
        For timed target series, hold uncertain shots for Jury review. Enter measured upper bounds for this
        installation; leave unknown bounds blank. These values do not extend the firing time. Finish the competition
        before saving changes.
      </p>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {settings && (
        <fieldset disabled={busy} className="space-y-3">
          <label className="flex flex-col gap-1">
            Timing assessment
            <select
              className="rounded bg-zinc-900 p-2"
              value={settings.mode}
              onChange={(event) => {
                setSettings({ ...settings, mode: event.target.value as TimedTargetTimingSettings['mode'] });
                setSaved(false);
              }}
            >
              <option value="BOUNDED">Review uncertain timing</option>
              <option value="TIMESTAMP">Use the supplied timestamp</option>
            </select>
          </label>
          {settings.mode === 'TIMESTAMP' && (
            <p className="text-amber-300">Reception delay and clock uncertainty will not be considered.</p>
          )}
          {(
            [
              ['maximumReceiptDelayMilliseconds', 'Maximum reception delay (ms)'],
              ['clockUncertaintyMilliseconds', 'Clock uncertainty (ms)'],
            ] as const
          ).map(([key, label]) => (
            <label className="flex flex-col gap-1" key={key}>
              {label}
              <input
                className="rounded bg-zinc-900 p-2"
                type="number"
                min={0}
                max={60000}
                step={1}
                disabled={settings.mode === 'TIMESTAMP'}
                value={settings[key] ?? ''}
                placeholder="Unknown"
                onChange={(event) => {
                  setSettings({ ...settings, [key]: event.target.value === '' ? null : Number(event.target.value) });
                  setSaved(false);
                }}
              />
            </label>
          ))}
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-2 disabled:opacity-50"
            onClick={() => void save()}
          >
            Save shot timing
          </button>
        </fieldset>
      )}
      {settings && (
        <TimingProfilesPanel
          key={profileGeneration}
          settings={settings}
          onApplied={(value) => {
            setSettings(value);
            setSaved(false);
            setError(null);
          }}
        />
      )}
      {saved && (
        <p role="status" className="text-emerald-300">
          Shot timing saved.
        </p>
      )}
    </section>
  );
}

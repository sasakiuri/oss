// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { timedTargetService } from '@/renderer/services/timedTargetService';
import type { TimingProfileStatus } from '@/shared/ipc/contracts/timingProfiles.schema';
import type { TimedTargetTimingSettings } from '@/shared/mqtt/TimedTargetTimingSettings';

import { TimingMeasurementImport, type AnalyzedTimingMeasurements } from './TimingMeasurementImport';

export function TimingProfilesPanel({
  settings,
  onApplied,
}: {
  settings: TimedTargetTimingSettings;
  onApplied: (settings: TimedTargetTimingSettings) => void;
}) {
  const [status, setStatus] = useState<TimingProfileStatus | null>(null);
  const [name, setName] = useState('');
  const [installation, setInstallation] = useState('');
  const [reference, setReference] = useState('');
  const [measuredAt, setMeasuredAt] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [installationDescription, setInstallationDescription] = useState('');
  const [official, setOfficial] = useState('');
  const [selected, setSelected] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boundsSource, setBoundsSource] = useState<'ENTERED' | 'MEASUREMENTS'>('ENTERED');
  const [measurements, setMeasurements] = useState<AnalyzedTimingMeasurements | null>(null);
  const profileSettings = boundsSource === 'MEASUREMENTS' ? measurements?.analysis.settings : settings;
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  const profile = status?.profiles.find((value) => value.id === selected);
  return (
    <section aria-label="Measured timing profiles" className="space-y-3 border-t border-zinc-700 pt-3">
      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={() =>
          void act(async () => {
            setStatus(await timedTargetService.getTimingProfiles());
            setConfirmed(false);
          })
        }
      >
        Load measured timing profiles
      </button>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-emerald-300">
          {message}
        </p>
      )}
      {status && (
        <fieldset disabled={busy} className="space-y-3">
          {status.evidence && (
            <div className="space-y-1" role="status">
              <p>Start-check evidence: {status.evidence.state}</p>
              <ul>
                {status.evidence.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          <p>Saved connection: {status.connectionLabel}</p>
          <p>
            Timing mode: {status.state.replaceAll('_', ' ')}
            {status.issue ? ` — ${status.issue}` : ''}
          </p>
          <p className="text-zinc-400">
            Profiles retain entered measurements. Verify the physical target, wiring and clock setup before applying a
            profile. Blank bounds remain unknown and require timing review.
          </p>
          <label className="block">
            Timing profile
            <select
              className={input}
              value={selected}
              onChange={(event) => {
                setSelected(event.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">Select measured profile</option>
              {status.profiles.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name} — {value.connectionLabel}
                </option>
              ))}
            </select>
          </label>
          {profile && (
            <div className="space-y-2 rounded border border-zinc-700 p-2">
              <p>{profile.installationReference}</p>
              {profile.installationDescription && <p>Recorded configuration: {profile.installationDescription}</p>}
              <p>
                Valid until:{' '}
                {profile.validUntil ? new Date(profile.validUntil).toLocaleString() : 'No expiry specified'}
              </p>
              <p>Evidence: {profile.measurementReference}</p>
              {profile.measurementEvidence && (
                <p className="break-all text-xs">
                  Measurement source: {profile.measurementEvidence.analysis.sourceName} · SHA-256:{' '}
                  {profile.measurementEvidence.analysis.sourceSha256} · Reception samples:{' '}
                  {profile.measurementEvidence.analysis.receiptSamples} · Clock samples:{' '}
                  {profile.measurementEvidence.analysis.clockSamples}
                </p>
              )}
              <p>
                {profile.measuredBy} · {new Date(profile.measuredAt).toLocaleString()}
              </p>
              <p>
                Maximum delay: {profile.settings.maximumReceiptDelayMilliseconds ?? 'Unknown'} ms; clock uncertainty:{' '}
                {profile.settings.clockUncertaintyMilliseconds ?? 'Unknown'} ms
              </p>
              <label className="flex gap-2">
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I
                confirmed that the current installation matches this measurement.
              </label>
              <button
                type="button"
                className={button}
                disabled={!confirmed || !official.trim()}
                onClick={() =>
                  void act(async () => {
                    const result = await timedTargetService.applyTimingProfile({
                      profileId: profile.id,
                      expectedRevision: status.revision,
                      installationConfirmed: true,
                      officialName: official,
                    });
                    setStatus(result);
                    setConfirmed(false);
                    onApplied(result.settings);
                    setMessage('Measured timing profile applied.');
                  })
                }
              >
                Apply selected timing profile
              </button>
            </div>
          )}
          <label className="block">
            Timing official
            <input
              className={input}
              value={official}
              maxLength={200}
              onChange={(event) => setOfficial(event.target.value)}
            />
          </label>
          <details>
            <summary>Record an equipment or clock setup change</summary>
            <p>Current configuration: {status.installation?.description ?? 'No configuration revision recorded'}</p>
            <p className="text-zinc-400">
              Record target and controller firmware, wiring or clock changes. Existing measured profiles will need
              review; save a new measurement for this configuration.
            </p>
            <label className="block">
              Current equipment and clock configuration
              <textarea
                className={input}
                value={installationDescription}
                maxLength={1000}
                onChange={(event) => setInstallationDescription(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={button}
              disabled={!installationDescription.trim() || !official.trim()}
              onClick={() =>
                void act(async () => {
                  const result = await timedTargetService.recordTimingInstallation({
                    expectedRevision: status.revision,
                    description: installationDescription,
                    officialName: official,
                  });
                  setStatus(result);
                  setConfirmed(false);
                  onApplied(result.settings);
                  setMessage('Installation recorded. Review timing measurements for this configuration.');
                })
              }
            >
              Record changed installation
            </button>
          </details>
          <details>
            <summary>Save a new measured profile</summary>
            <div className="mt-2 space-y-2">
              <p className="text-zinc-400">
                Choose entered bounds or analyze measurement data. Saving keeps the active timing settings unchanged
                until you apply the profile.
              </p>
              <label className="block">
                Profile bounds source
                <select
                  className={input}
                  value={boundsSource}
                  onChange={(event) => {
                    setBoundsSource(event.target.value as typeof boundsSource);
                    setMeasurements(null);
                  }}
                >
                  <option value="ENTERED">Values entered in Shot timing</option>
                  <option value="MEASUREMENTS">Measurement data with explicit margins</option>
                </select>
              </label>
              {boundsSource === 'MEASUREMENTS' && <TimingMeasurementImport onAnalyzed={setMeasurements} />}
              <label className="block">
                Profile name
                <input
                  className={input}
                  value={name}
                  maxLength={200}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="block">
                Installation and clock setup
                <textarea
                  className={input}
                  value={installation}
                  maxLength={1000}
                  onChange={(event) => setInstallation(event.target.value)}
                />
              </label>
              <label className="block">
                Measurement evidence reference
                <textarea
                  className={input}
                  value={reference}
                  maxLength={2000}
                  onChange={(event) => setReference(event.target.value)}
                />
              </label>
              <label className="block">
                Measurement time
                <input
                  className={input}
                  type="datetime-local"
                  value={measuredAt}
                  onChange={(event) => setMeasuredAt(event.target.value)}
                />
              </label>
              <p>
                Profile maximum delay: {profileSettings?.maximumReceiptDelayMilliseconds ?? 'Unknown'} ms; clock
                uncertainty: {profileSettings?.clockUncertaintyMilliseconds ?? 'Unknown'} ms
              </p>
              <label className="block">
                Measurement valid until (optional)
                <input
                  className={input}
                  type="datetime-local"
                  value={validUntil}
                  onChange={(event) => setValidUntil(event.target.value)}
                />
              </label>
              <button
                type="button"
                className={button}
                disabled={
                  !profileSettings ||
                  profileSettings.mode !== 'BOUNDED' ||
                  !name.trim() ||
                  !installation.trim() ||
                  !reference.trim() ||
                  !measuredAt ||
                  !official.trim()
                }
                onClick={() =>
                  void act(async () => {
                    if (!profileSettings || profileSettings.mode !== 'BOUNDED') return;
                    const id = crypto.randomUUID();
                    const result = await timedTargetService.saveTimingProfile({
                      id,
                      expectedRevision: status.revision,
                      name,
                      installationReference: installation,
                      measurementReference: reference,
                      measuredBy: official,
                      measuredAt: new Date(measuredAt).toISOString(),
                      ...(validUntil ? { validUntil: new Date(validUntil).toISOString() } : {}),
                      settings: { ...profileSettings, mode: 'BOUNDED' },
                      ...(boundsSource === 'MEASUREMENTS' && measurements
                        ? { measurements: measurements.request }
                        : {}),
                    });
                    setStatus(result);
                    setSelected(id);
                    setConfirmed(false);
                    setMessage('Measurement saved. Select Apply to change the active bounds.');
                  })
                }
              >
                Save timing measurement
              </button>
            </div>
          </details>
          {status.applications.length > 0 && (
            <details>
              <summary>Timing profile application history</summary>
              <ul>
                {[...status.applications].reverse().map((value) => (
                  <li key={value.id}>
                    {new Date(value.appliedAt).toLocaleString()} · {value.officialName} ·{' '}
                    {status.profiles.find((item) => item.id === value.profileId)?.name ?? value.profileId}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </fieldset>
      )}
    </section>
  );
}
const button = 'rounded bg-zinc-700 px-3 py-2 disabled:opacity-50';
const input = 'mt-1 block w-full rounded bg-zinc-900 p-2';

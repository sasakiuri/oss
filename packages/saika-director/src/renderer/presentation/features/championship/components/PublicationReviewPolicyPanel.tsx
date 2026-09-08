import { useEffect, useState, type FormEvent } from 'react';

import { publicationReviewPolicyService } from '@/renderer/services';
import type { ResultPublicationReviewSettingsDto } from '@/shared/ipc/contracts';
import type { PublicationReviewPolicyStatus } from '@/shared/ipc/contracts/publicationReviewPolicy.contract';
import { Button } from '../../shared/common/Button';

const checks: { key: keyof ResultPublicationReviewSettingsDto; label: string }[] = [
  { key: 'requireObservationReviews', label: 'Review unscored shots and firing-window evidence' },
  { key: 'requireIncidentReports', label: 'Complete incident reports' },
  { key: 'requireEquipmentChecksComplete', label: 'Complete equipment checks and adjudications' },
  { key: 'requireProtestCasesComplete', label: 'Complete protest cases' },
  { key: 'requireFinalRecoveriesComplete', label: 'Complete Final recoveries' },
];
const inputClass = 'w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1.5 text-vscode-text';

export function PublicationReviewPolicyPanel({
  eventId,
  resultScope,
  onChanged,
}: {
  eventId: string;
  resultScope: 'QUALIFICATION' | 'FINAL';
  onChanged: () => Promise<void>;
}) {
  const [status, setStatus] = useState<PublicationReviewPolicyStatus | null>(null);
  const [mode, setMode] = useState<'INHERIT' | 'PINNED'>('INHERIT');
  const [settings, setSettings] = useState<ResultPublicationReviewSettingsDto | null>(null);
  const [officialName, setOfficialName] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus(null);
    setError(null);
    void publicationReviewPolicyService
      .get({ eventId, resultScope })
      .then((response) => {
        if (!active) return;
        if (!response.success) throw new Error(response.error.message);
        setStatus(response.data);
        setMode(response.data.mode);
        setSettings(response.data.effectiveSettings);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Failed to load event review settings');
      });
    return () => {
      active = false;
    };
  }, [eventId, resultScope, reload]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!status || !settings) return;
    setSaving(true);
    setError(null);
    try {
      const response = await publicationReviewPolicyService.save({
        eventId,
        resultScope,
        mode,
        settings,
        expectedRevision: status.revision,
        officialName,
        reason,
      });
      if (!response.success) throw new Error(response.error.message);
      setStatus(response.data);
      setMode(response.data.mode);
      setSettings(response.data.effectiveSettings);
      setReason('');
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to save event review settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label="Event publication review settings"
      className="space-y-3 rounded-[3px] border border-vscode-border p-3 text-xs text-vscode-text"
    >
      <p>Choose which additional reviews must be complete before this event's results become official.</p>
      <p className="text-vscode-text-muted">
        Fixed settings apply only to this event and round. Shared defaults follow the application settings. Saving here
        requires a new result-list approval and, if already posted, a revised preliminary posting. Individual result
        checks remain valid when the scores are unchanged.
      </p>
      {error && (
        <p role="alert" className="text-vscode-error">
          {error}
        </p>
      )}
      {!status && !error && <p>Loading event review settings…</p>}
      <Button size="sm" variant="secondary" disabled={saving} onClick={() => setReload((value) => value + 1)}>
        Reload event settings
      </Button>
      {status && settings && (
        <>
          {!status.editable && <p>Settings are read-only after official publication or Final declaration.</p>}
          <form onSubmit={(event) => void save(event)} className="space-y-3">
            <fieldset disabled={!status.editable || saving} className="space-y-3">
              <label className="block">
                Settings source
                <select
                  className={`${inputClass} mt-1`}
                  value={mode}
                  onChange={(event) => setMode(event.target.value as typeof mode)}
                >
                  <option value="INHERIT">Follow shared defaults</option>
                  <option value="PINNED">Fixed for this event and round</option>
                </select>
              </label>
              {checks
                .filter(({ key }) => key !== 'requireFinalRecoveriesComplete' || resultScope === 'FINAL')
                .map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={(mode === 'INHERIT' ? status.defaults : settings)[key]}
                      disabled={mode === 'INHERIT'}
                      onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              <p className="text-vscode-text-muted">
                Personal changes require the RTS Jury role when access control is enabled. Otherwise, the entered name
                is recorded as a manual confirmation.
              </p>
              <label className="block">
                Responsible official
                <input
                  className={`${inputClass} mt-1`}
                  required
                  maxLength={200}
                  value={officialName}
                  onChange={(event) => setOfficialName(event.target.value)}
                />
              </label>
              <label className="block">
                Reason for these event settings
                <textarea
                  className={`${inputClass} mt-1`}
                  required
                  maxLength={2000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <Button type="submit" size="sm" disabled={!officialName.trim() || !reason.trim()}>
                Save event settings
              </Button>
            </fieldset>
          </form>
          {status.history.length > 0 && (
            <details>
              <summary className="cursor-pointer">Event setting history ({status.history.length})</summary>
              <ol className="mt-2 space-y-2">
                {[...status.history].reverse().map((entry) => (
                  <li key={entry.id}>
                    <p>
                      {new Date(entry.recordedAt).toLocaleString()} ·{' '}
                      {entry.mode === 'PINNED' ? 'Fixed' : 'Shared defaults'} · {entry.signingEvidence.recordedBy} (
                      {entry.signingEvidence.method.toLowerCase()})
                    </p>
                    <p>{entry.reason}</p>
                    <p className="text-vscode-text-muted">
                      Required when recorded:{' '}
                      {checks
                        .filter(
                          ({ key }) =>
                            entry.settings[key] &&
                            (key !== 'requireFinalRecoveriesComplete' || resultScope === 'FINAL'),
                        )
                        .map(({ label }) => label)
                        .join('; ') || 'No additional reviews'}
                    </p>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  );
}

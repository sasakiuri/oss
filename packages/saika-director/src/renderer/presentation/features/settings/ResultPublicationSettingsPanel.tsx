import { useEffect, useState } from 'react';

import { resultPublicationService } from '@/renderer/services';
import type { ResultPublicationReviewSettingsDto } from '@/shared/ipc/contracts/resultPublication.contract';

import { Button } from '../shared/common/Button';

export function ResultPublicationSettingsPanel() {
  const [settings, setSettings] = useState<ResultPublicationReviewSettingsDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let disposed = false;
    void resultPublicationService
      .getReviewSettings()
      .then((response) => {
        if (disposed) return;
        if (!response.success) throw new Error(response.error.message);
        setSettings(response.data);
      })
      .catch((caught: unknown) => {
        if (!disposed) setError(String(caught));
      });
    return () => {
      disposed = true;
    };
  }, []);
  const save = async () => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await resultPublicationService.setReviewSettings(settings);
      if (!response.success) throw new Error(response.error.message);
      setSettings(response.data);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Official result checks" className="mt-6 space-y-3 border-t border-vscode-border py-4">
      <h3 className="text-sm font-semibold text-vscode-text">Official result checks</h3>
      <p className="text-xs text-vscode-text-muted">
        These checks apply to official result publication, Final declarations, and Results Books. Each can be enabled
        independently for this installation; the underlying records remain available for review.
      </p>
      {error && (
        <p role="alert" className="text-xs text-vscode-error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-xs text-vscode-success">
          Official result checks saved.
        </p>
      )}
      {settings && (
        <fieldset disabled={busy} className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={settings.requireIncidentReports}
              onChange={(event) => {
                setSettings({ ...settings, requireIncidentReports: event.target.checked });
                setSaved(false);
              }}
            />
            Require current Incident Reports for substantive scoring decisions
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={settings.requireFinalRecoveriesComplete}
              onChange={(event) => {
                setSettings({ ...settings, requireFinalRecoveriesComplete: event.target.checked });
                setSaved(false);
              }}
            />
            Require completed or voided Final recovery cases
          </label>
          <Button size="sm" onClick={() => void save()}>
            Save official result checks
          </Button>
        </fieldset>
      )}
    </section>
  );
}

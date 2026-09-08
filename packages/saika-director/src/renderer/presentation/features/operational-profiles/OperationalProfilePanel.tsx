import { useEffect, useState } from 'react';

import { operationalProfilesService } from '@/renderer/services';
import type {
  OperationalProfileMode,
  OperationalProfilePreviewDto,
  OperationalProfileResultDto,
} from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

export function OperationalProfilePanel({
  competitionId,
  onApplied,
}: {
  competitionId: string;
  onApplied: () => void;
}) {
  const [modes, setModes] = useState<Record<string, OperationalProfileMode>>({});
  const [preview, setPreview] = useState<OperationalProfilePreviewDto | null>(null);
  const [result, setResult] = useState<OperationalProfileResultDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let disposed = false;
    setPreview(null);
    void operationalProfilesService
      .preview({ competitionId, modes })
      .then((response) => {
        if (disposed) return;
        if (!response.success) throw new Error(response.error.message);
        setPreview(response.data);
      })
      .catch((caught: unknown) => {
        if (!disposed) setError(String(caught));
      });
    return () => {
      disposed = true;
    };
  }, [competitionId, modes, refresh]);
  const choose = (next: Record<string, OperationalProfileMode>) => {
    setModes(next);
    setResult(null);
    setError(null);
    setPreview(null);
  };
  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const response = await operationalProfilesService.apply({
        competitionId,
        modes,
        fingerprint: preview.fingerprint,
      });
      if (!response.success) throw new Error(response.error.message);
      setResult(response.data);
      onApplied();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setRefresh((value) => value + 1);
    }
  };
  return (
    <section aria-label="Operational profile" className="space-y-3">
      <h2 className="text-sm font-semibold">Operational profile</h2>
      <p className="text-xs text-vscode-text-muted">
        Review the changes before saving. Required checks must be completed before START. Clock policy applies to all
        competitions on this Director; its configured tolerances stay the same.
      </p>
      {error && (
        <p role="alert" className="text-xs text-vscode-error">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="space-y-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!preview}
            onClick={() => choose(Object.fromEntries(preview!.changes.map((change) => [change.id, 'REQUIRED'])))}
          >
            Require all listed checks
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!preview}
            onClick={() => choose(Object.fromEntries(preview!.changes.map((change) => [change.id, 'ADVISORY'])))}
          >
            Use advisory checks
          </Button>
        </div>
        {preview && (
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Scope</th>
                <th>Current</th>
                <th>Proposed</th>
              </tr>
            </thead>
            <tbody>
              {preview.changes.map((change) => (
                <tr key={change.id}>
                  <td>{change.label}</td>
                  <td>{change.scope === 'DIRECTOR' ? 'All competitions' : 'This competition'}</td>
                  <td>{change.before}</td>
                  <td>
                    <select
                      aria-label={`${change.label} mode`}
                      className="border border-vscode-border bg-vscode-input p-1"
                      value={change.after}
                      onChange={(event) =>
                        choose({ ...modes, [change.id]: event.target.value as OperationalProfileMode })
                      }
                    >
                      <option value="ADVISORY">Advisory</option>
                      <option value="REQUIRED">Required</option>
                      <option value="DISABLED">Disabled</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Button
          size="sm"
          disabled={!preview || !preview.changes.some((change) => change.before !== change.after)}
          onClick={() => void apply()}
        >
          Apply reviewed settings
        </Button>
      </fieldset>
      {result && (
        <div role="status" className="text-xs">
          <p>
            {result.complete
              ? 'Settings confirmed.'
              : 'Some settings need attention. Review the current values before retrying.'}
          </p>
          <ul>
            {result.results.map((item) => (
              <li key={item.id}>
                {preview?.changes.find((change) => change.id === item.id)?.label ?? item.id}: {item.status} —{' '}
                {item.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

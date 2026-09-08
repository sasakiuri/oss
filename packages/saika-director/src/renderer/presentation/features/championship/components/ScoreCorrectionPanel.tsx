// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useState } from 'react';

import { scoreCorrectionsService } from '@/renderer/services';
import type {
  ScoreCorrectionPreviewDto,
  ScoreCorrectionRequestDto,
  ScoreCorrectionWorkspaceDto,
} from '@/shared/ipc/contracts';

const inputClass = 'rounded border border-vscode-border bg-vscode-input p-2 text-vscode-text';
const newChange = (): ScoreCorrectionRequestDto['changes'][number] => ({
  operation: 'REPLACE',
  shotIndex: 0,
  scoreX10: 0,
  decimalScore: null,
  innerTen: null,
  sourceShotId: null,
  evidenceReference: '',
});

export function ScoreCorrectionPanel({
  resultId,
  resultScope,
  onChanged,
}: {
  resultId: string;
  resultScope: 'QUALIFICATION' | 'FINAL';
  onChanged: () => void;
}) {
  const [workspace, setWorkspace] = useState<ScoreCorrectionWorkspaceDto | null>(null);
  const [preview, setPreview] = useState<ScoreCorrectionPreviewDto | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [caseId, setCaseId] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('');
  const [changes, setChanges] = useState([newChange()]);
  const [confirmed, setConfirmed] = useState(false);
  const load = useCallback(async () => {
    const response = await scoreCorrectionsService.workspace({ resultId, resultScope });
    if (!response.success) throw new Error(response.error.message);
    setWorkspace(response.data);
  }, [resultId, resultScope]);
  useEffect(() => {
    void load().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'Unable to load corrections'),
    );
  }, [load]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Correction failed');
    } finally {
      setBusy(false);
    }
  };
  const update = (index: number, patch: Partial<ScoreCorrectionRequestDto['changes'][number]>) =>
    setChanges((current) => current.map((change, position) => (position === index ? { ...change, ...patch } : change)));
  const active = workspace?.history.find((item) => !item.withdrawal);
  return (
    <details className="my-3 rounded border border-vscode-border p-3">
      <summary className="cursor-pointer font-medium">Restore or correct shots from Jury evidence</summary>
      <p className="my-2 text-xs">
        The Jury must confirm the athlete, shot positions and evidence. Source shots remain unchanged. Inserting a
        missing shot shifts later positions and removes the final extra shot from the counted result.
      </p>
      {error && (
        <p role="alert" className="text-vscode-error">
          {error}
        </p>
      )}
      {workspace?.projection.issues.map((issue) => (
        <p key={issue} className="text-vscode-warning">
          {issue}
        </p>
      ))}
      <form
        aria-label="Jury shot correction"
        className="space-y-3"
        onChangeCapture={() => {
          setPreview(null);
          setConfirmed(false);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const selected = workspace?.cases.find((item) => item.id === caseId);
            if (!selected) throw new Error('Select linked evidence with a Jury decision');
            const response = await scoreCorrectionsService.preview({
              resultId,
              resultScope,
              caseId,
              decisionId: selected.decisionId,
              officialName,
              statement,
              changes,
            });
            if (!response.success) throw new Error(response.error.message);
            setConfirmed(false);
            setPreview(response.data);
          });
        }}
      >
        <label className="block">
          RTS / Jury official{' '}
          <input
            aria-label="Correction official"
            className={`${inputClass} w-full`}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            required
          />
        </label>
        <label className="block">
          Evidence confirmation / withdrawal reason{' '}
          <textarea
            aria-label="Correction statement"
            className={`${inputClass} w-full`}
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            required
          />
        </label>
        {!active && (
          <>
            <label className="block">
              Linked Jury evidence{' '}
              <select
                className={`${inputClass} w-full`}
                value={caseId}
                onChange={(event) => setCaseId(event.target.value)}
                required
              >
                <option value="">Select a Jury decision</option>
                {workspace?.cases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.summary}
                  </option>
                ))}
              </select>
            </label>
            {workspace?.cases.length === 0 && (
              <p>
                Link a target examination with a Jury decision, or complete the Final recovery case and retrieve its
                firing evidence.
              </p>
            )}
            {caseId && <p className="text-xs">{workspace?.cases.find((item) => item.id === caseId)?.decision}</p>}
            {changes.map((change, index) => (
              <fieldset key={index} className="grid grid-cols-2 gap-2 border border-vscode-border p-2">
                <legend>Correction {index + 1}</legend>
                <label>
                  Action{' '}
                  <select
                    className={`${inputClass} w-full`}
                    value={change.operation}
                    onChange={(event) =>
                      update(index, { operation: event.target.value as 'REPLACE' | 'INSERT_MISSING' })
                    }
                  >
                    <option value="REPLACE">Replace this position</option>
                    <option value="INSERT_MISSING">Insert missing shot, exclude last</option>
                  </select>
                </label>
                <label>
                  Shot number{' '}
                  <input
                    type="number"
                    min="1"
                    max={workspace?.basis.shots.length}
                    className={`${inputClass} w-full`}
                    value={change.shotIndex + 1}
                    onChange={(event) => update(index, { shotIndex: Number(event.target.value) - 1 })}
                    required
                  />
                </label>
                <label>
                  {workspace?.scoring === 'HIT_MISS'
                    ? 'Hit (1) / miss (0)'
                    : 'Corrected score (0 for a miss or annulment)'}{' '}
                  <input
                    type="number"
                    min="0"
                    max={workspace?.scoring === 'HIT_MISS' ? 1 : workspace?.scoring === 'RING' ? 10 : 10.9}
                    step={workspace?.scoring === 'DECIMAL' ? '0.1' : '1'}
                    className={`${inputClass} w-full`}
                    value={change.scoreX10 / 10}
                    onChange={(event) => update(index, { scoreX10: Math.round(Number(event.target.value) * 10) })}
                    required
                  />
                </label>
                <label>
                  Source shot ID, if available{' '}
                  <input
                    className={`${inputClass} w-full`}
                    value={change.sourceShotId ?? ''}
                    onChange={(event) => update(index, { sourceShotId: event.target.value || null })}
                  />
                </label>
                {workspace?.scoring !== 'HIT_MISS' && (
                  <>
                    <label>
                      Verified EST decimal score, if available{' '}
                      <input
                        type="number"
                        min="0"
                        max="10.9"
                        step="0.1"
                        className={`${inputClass} w-full`}
                        value={change.decimalScore ?? ''}
                        onChange={(event) =>
                          update(index, { decimalScore: event.target.value === '' ? null : Number(event.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Inner ten evidence{' '}
                      <select
                        className={`${inputClass} w-full`}
                        value={change.innerTen === null ? 'unknown' : String(change.innerTen)}
                        onChange={(event) =>
                          update(index, {
                            innerTen: event.target.value === 'unknown' ? null : event.target.value === 'true',
                          })
                        }
                      >
                        <option value="unknown">Unknown</option>
                        <option value="true">Inner ten</option>
                        <option value="false">Not an inner ten</option>
                      </select>
                    </label>
                  </>
                )}
                <label className="col-span-2">
                  Evidence / IR reference{' '}
                  <input
                    className={`${inputClass} w-full`}
                    value={change.evidenceReference}
                    onChange={(event) => update(index, { evidenceReference: event.target.value })}
                    required
                  />
                </label>
                {changes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setChanges((current) => current.filter((_, position) => position !== index));
                      setPreview(null);
                      setConfirmed(false);
                    }}
                  >
                    Remove correction
                  </button>
                )}
              </fieldset>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setChanges((current) => [...current, newChange()]);
                setPreview(null);
                setConfirmed(false);
              }}
            >
              Add another correction
            </button>
            <button type="submit" className={`${inputClass} ml-3`} disabled={busy || !workspace}>
              Preview corrected result
            </button>
          </>
        )}
      </form>
      {preview && (
        <div className="mt-3 space-y-2">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Shot</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {preview.shots.map((shot, index) =>
                JSON.stringify(shot) === JSON.stringify(preview.basis.shots[index]) ? null : (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>{preview.basis.shots[index]!.scoreX10 / 10}</td>
                    <td>{shot.scoreX10 / 10}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          <p>
            Counted total before penalties: {preview.basis.shots.reduce((sum, shot) => sum + shot.scoreX10, 0) / 10} →{' '}
            {preview.shots.reduce((sum, shot) => sum + shot.scoreX10, 0) / 10}
          </p>
          <label className="block">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I
            confirm the Jury evidence, athlete and all changed positions.
          </label>
          <button
            type="button"
            className={inputClass}
            disabled={busy || !confirmed}
            onClick={() =>
              void run(async () => {
                const response = await scoreCorrectionsService.apply({
                  id: crypto.randomUUID(),
                  request: preview.request,
                  expectedDigest: preview.digest,
                  confirmed: true,
                });
                if (!response.success) throw new Error(response.error.message);
                setPreview(null);
                setConfirmed(false);
                await load();
                onChanged();
              })
            }
          >
            Apply confirmed correction
          </button>
        </div>
      )}
      {workspace?.history.map(({ application, withdrawal }) => (
        <div key={application.id} className="mt-3 border-t border-vscode-border pt-2 text-xs">
          <p>
            {withdrawal ? 'Withdrawn' : 'Active'} · Correction {application.id} · {application.recordedAt} ·{' '}
            {application.request.officialName}: {application.request.statement}
          </p>
          {!withdrawal && (
            <button
              type="button"
              className={`${inputClass} mt-2`}
              disabled={busy || !officialName.trim() || !statement.trim()}
              onClick={() =>
                void run(async () => {
                  const response = await scoreCorrectionsService.withdraw({
                    id: crypto.randomUUID(),
                    applicationId: application.id,
                    officialName,
                    statement,
                  });
                  if (!response.success) throw new Error(response.error.message);
                  await load();
                  onChanged();
                })
              }
            >
              Withdraw correction using the official and reason above
            </button>
          )}
        </div>
      ))}
    </details>
  );
}

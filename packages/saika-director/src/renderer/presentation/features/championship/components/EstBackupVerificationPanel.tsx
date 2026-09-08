import { useCallback, useEffect, useState } from 'react';
import { estBackupVerificationService } from '@/renderer/services';
import type {
  CreateEstBackupVerificationPayload,
  EstBackupVerificationRunDto,
  EstBackupColumnMappingDto,
} from '@/shared/ipc/contracts';
import { Button } from '../../shared/common/Button';

export function EstBackupVerificationPanel({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [runs, setRuns] = useState<EstBackupVerificationRunDto[]>([]);
  const [kind, setKind] = useState<CreateEstBackupVerificationPayload['resultKind']>('INDIVIDUAL');
  const [keyType, setKeyType] = useState<CreateEstBackupVerificationPayload['keyType']>('START_NUMBER');
  const [sourceName, setSourceName] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [recordsText, setRecordsText] = useState('[\n  { "key": "101", "rank": 1, "totalScore": 630.1 }\n]');
  const [importedProvenance, setImportedProvenance] = useState(false);
  const [review, setReview] = useState('');
  const [official, setOfficial] = useState('');
  const [importing, setImporting] = useState(false);
  const [fileLayout, setFileLayout] = useState<'CANONICAL' | 'MAPPED'>('CANONICAL');
  const [mapping, setMapping] = useState<EstBackupColumnMappingDto>({
    delimiter: ';',
    decimalSeparator: '.',
    keyColumn: 'Bib',
    totalScoreColumn: 'Total',
    rankColumn: null,
  });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await estBackupVerificationService.list({ eventId });
    if (response.success) setRuns(response.data);
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
      <header className="flex justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-vscode-text">EST printout / independent-memory verification</h3>
          <p className="text-xs text-vscode-text-muted">
            Top 10 individual / top 3 team comparison required by ISSF 6.14.8.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </header>
      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            try {
              const records = JSON.parse(recordsText) as CreateEstBackupVerificationPayload['records'];
              const response = await estBackupVerificationService.verify({
                eventId,
                resultKind: kind,
                keyType,
                sourceName,
                records,
                ...(sourceReference.trim() ? { sourceReference } : {}),
                ...(review.trim() ? { interventionReviewStatement: review } : {}),
                officialName: official,
              });
              if (!response.success) throw new Error(response.error.message);
              await load();
              setError(null);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Invalid backup input');
            }
          })();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Result kind">
            <select
              value={kind}
              onChange={(e) => {
                const value = e.target.value as typeof kind;
                setKind(value);
                setKeyType(value === 'INDIVIDUAL' ? 'START_NUMBER' : 'TEAM_ID');
              }}
              className={inputClass}
            >
              <option value="INDIVIDUAL">Individual</option>
              <option value="TEAM">Team</option>
              <option value="MIXED_TEAM">Mixed Team</option>
            </select>
          </Field>
          <Field label="Comparison key">
            <select
              value={keyType}
              onChange={(e) => setKeyType(e.target.value as typeof keyType)}
              className={inputClass}
            >
              <option value="PARTICIPANT_ID">Participant ID</option>
              <option value="START_NUMBER">Start number</option>
              <option value="ISSF_ID">ISSF ID</option>
              <option value="TEAM_ID">Team ID</option>
            </select>
          </Field>
          <Field label="Printout or independent-memory source">
            <input required value={sourceName} onChange={(e) => setSourceName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Source reference / media identifier">
            <input
              value={sourceReference}
              onChange={(e) => setSourceReference(e.target.value)}
              readOnly={importedProvenance}
              className={inputClass}
            />
          </Field>
        </div>
        <fieldset disabled={importing} className="space-y-3 rounded-[3px] border border-vscode-border p-2">
          <Field label="File layout">
            <select
              className={inputClass}
              value={fileLayout}
              onChange={(event) => setFileLayout(event.target.value as typeof fileLayout)}
            >
              <option value="CANONICAL">Canonical JSON / CSV</option>
              <option value="MAPPED">Column-mapped delimited text</option>
            </select>
          </Field>
          {fileLayout === 'MAPPED' && (
            <div className="space-y-2">
              <p className="text-xs text-vscode-text-muted">
                Enter the exact header names from the exported file. Keys keep leading zeros. Check that the chosen key
                column matches the Comparison key above. Files must use UTF-8.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Key column">
                  <input
                    className={inputClass}
                    maxLength={100}
                    value={mapping.keyColumn}
                    onChange={(event) => setMapping({ ...mapping, keyColumn: event.target.value })}
                  />
                </Field>
                <Field label="Total score column">
                  <input
                    className={inputClass}
                    maxLength={100}
                    value={mapping.totalScoreColumn}
                    onChange={(event) => setMapping({ ...mapping, totalScoreColumn: event.target.value })}
                  />
                </Field>
                <Field label="Rank column (optional)">
                  <input
                    className={inputClass}
                    maxLength={100}
                    value={mapping.rankColumn ?? ''}
                    onChange={(event) => setMapping({ ...mapping, rankColumn: event.target.value || null })}
                  />
                </Field>
                <Field label="Column separator">
                  <select
                    className={inputClass}
                    value={mapping.delimiter}
                    onChange={(event) =>
                      setMapping({
                        ...mapping,
                        delimiter: event.target.value as EstBackupColumnMappingDto['delimiter'],
                      })
                    }
                  >
                    <option value=";">Semicolon</option>
                    <option value=",">Comma</option>
                    <option value={'\t'}>Tab</option>
                  </select>
                </Field>
                <Field label="Decimal separator">
                  <select
                    className={inputClass}
                    value={mapping.decimalSeparator}
                    onChange={(event) =>
                      setMapping({
                        ...mapping,
                        decimalSeparator: event.target.value as EstBackupColumnMappingDto['decimalSeparator'],
                      })
                    }
                  >
                    <option value=".">Point (630.1)</option>
                    <option value=",">Comma (630,1)</option>
                  </select>
                </Field>
              </div>
            </div>
          )}
          <span className="text-xs text-vscode-text-muted">
            Review the imported records before comparison. The original file hash and any column mapping are retained in
            the source reference.
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={
              importing || (fileLayout === 'MAPPED' && (!mapping.keyColumn.trim() || !mapping.totalScoreColumn.trim()))
            }
            onClick={() => {
              void (async () => {
                setImporting(true);
                try {
                  const response =
                    fileLayout === 'MAPPED'
                      ? await estBackupVerificationService.importDelimitedRecords(mapping)
                      : await estBackupVerificationService.importRecords();
                  if (!response.success) throw new Error(response.error.message);
                  if (response.data.status === 'CANCELLED') return;
                  setRecordsText(JSON.stringify(response.data.records, null, 2));
                  setSourceName(response.data.sourceName);
                  setSourceReference(response.data.sourceReference);
                  setImportedProvenance(true);
                  setError(null);
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : 'Failed to import the EST backup source');
                } finally {
                  setImporting(false);
                }
              })();
            }}
          >
            {importing ? 'Importing...' : fileLayout === 'MAPPED' ? 'Import delimited file' : 'Import JSON / CSV'}
          </Button>
        </fieldset>
        <Field label='Backup records JSON: [{ "key", "rank" (optional), "totalScore" }]'>
          <textarea
            required
            rows={6}
            value={recordsText}
            onChange={(e) => {
              setRecordsText(e.target.value);
              if (importedProvenance) {
                setImportedProvenance(false);
                setSourceReference('');
              }
            }}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Manual-intervention review statement (required when applicable)">
            <input value={review} onChange={(e) => setReview(e.target.value)} className={inputClass} />
          </Field>
          <Field label="RTS official">
            <input required value={official} onChange={(e) => setOfficial(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Button type="submit" size="sm" disabled={importing}>
          Compare and retain
        </Button>
      </form>
      <div className="space-y-2">
        {[...runs].reverse().map((run) => (
          <div key={run.id} className="border-l-2 border-vscode-border pl-3 text-xs">
            <b className={run.verified ? 'text-vscode-success' : 'text-vscode-warning'}>
              {run.verified ? 'VERIFIED' : 'REVIEW REQUIRED'} · {run.resultKind}
            </b>
            <span className="block text-vscode-text-muted">
              {run.items.filter((item) => item.status === 'MATCH').length}/
              {run.items.filter((item) => item.officialRank !== null).length} official subjects match · {run.sourceName}
            </span>
            {run.sourceReference && <span className="block text-vscode-dimmed">{run.sourceReference}</span>}
            <span className="block text-vscode-dimmed">
              {run.officialName} · {new Date(run.verifiedAt).toLocaleString()} · snapshot{' '}
              {run.snapshotRevision.slice(0, 10)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-vscode-text-muted">
      {label}
      {children}
    </label>
  );
}
const inputClass =
  'min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[13px] text-vscode-text';

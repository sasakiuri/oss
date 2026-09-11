import { useCallback, useEffect, useState } from 'react';

import { estBackupVerificationService } from '@/renderer/services';
import type {
  CreateEstBackupVerificationPayload,
  EstBackupVerificationRunDto,
  EstBackupColumnMappingDto,
} from '@/shared/ipc/contracts';

import { Button } from '../../shared/common/Button';

import { EstBackupCapturePanel } from './EstBackupCapturePanel';
import { EstBackupResultChecksPanel } from './EstBackupResultChecksPanel';
import { EstBackupSourcesPanel } from './EstBackupSourcesPanel';

export function EstBackupVerificationPanel({
  eventId,
  resultScope = 'QUALIFICATION',
  initialKind = 'INDIVIDUAL',
  onClose,
}: {
  eventId: string;
  resultScope?: 'QUALIFICATION' | 'FINAL';
  initialKind?: CreateEstBackupVerificationPayload['resultKind'];
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<EstBackupVerificationRunDto[]>([]);
  const [kind, setKind] = useState<CreateEstBackupVerificationPayload['resultKind']>(initialKind);
  const [keyType, setKeyType] = useState<CreateEstBackupVerificationPayload['keyType']>(
    initialKind === 'INDIVIDUAL' ? 'START_NUMBER' : 'TEAM_ID',
  );
  const [detailRequirement, setDetailRequirement] =
    useState<NonNullable<CreateEstBackupVerificationPayload['detailRequirement']>>('AVAILABLE');
  const [sourceName, setSourceName] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [recordsText, setRecordsText] = useState('[\n  { "key": "101", "rank": 1, "totalScore": 630.1 }\n]');
  const [importedProvenance, setImportedProvenance] = useState(false);
  const [sourceId, setSourceId] = useState<string | undefined>();
  const [sourceGeneration, setSourceGeneration] = useState(0);
  const onCaptured = useCallback(() => setSourceGeneration((value) => value + 1), []);
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
  const selectedMapping = {
    ...mapping,
    shotScoreColumns: mapping.shotScoreColumns?.map((name) => name.trim()).filter(Boolean),
    seriesScoreColumns: mapping.seriesScoreColumns?.map((name) => name.trim()).filter(Boolean),
  };
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await estBackupVerificationService.list({ eventId });
    if (response.success) setRuns(response.data.filter((run) => (run.resultScope ?? 'QUALIFICATION') === resultScope));
  }, [eventId, resultScope]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
      <header className="flex justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-vscode-text">EST printout / independent-memory verification</h3>
          <p className="text-xs text-vscode-text-muted">
            {resultScope === 'FINAL' ? 'Final' : 'Qualification'} · Top individual / team results from an independent
            source.
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
                resultScope,
                resultKind: kind,
                keyType,
                sourceName,
                records,
                detailRequirement,
                ...(sourceId ? { sourceId } : {}),
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
              {resultScope === 'QUALIFICATION' && <option value="TEAM">Team</option>}
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
                <Field label="Shot score columns in firing order (one per line, optional)">
                  <textarea
                    rows={3}
                    className={inputClass}
                    value={(mapping.shotScoreColumns ?? []).join('\n')}
                    onChange={(event) => setMapping({ ...mapping, shotScoreColumns: event.target.value.split('\n') })}
                  />
                </Field>
                <Field label="Series score columns in order (one per line, optional)">
                  <textarea
                    rows={3}
                    className={inputClass}
                    value={(mapping.seriesScoreColumns ?? []).join('\n')}
                    onChange={(event) => setMapping({ ...mapping, seriesScoreColumns: event.target.value.split('\n') })}
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
                  const response = await estBackupVerificationService.captureRecords({
                    eventId,
                    ...(fileLayout === 'MAPPED' ? { mapping: selectedMapping } : {}),
                  });
                  if (!response.success) throw new Error(response.error.message);
                  if (response.data.status === 'CANCELLED') return;
                  setRecordsText(JSON.stringify(response.data.records, null, 2));
                  setSourceName(response.data.sourceName);
                  setSourceReference(response.data.sourceReference);
                  setImportedProvenance(true);
                  setSourceId(response.data.sourceId);
                  setSourceGeneration((value) => value + 1);
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
        <Field label="Required comparison detail">
          <select
            className={inputClass}
            value={detailRequirement}
            onChange={(event) => setDetailRequirement(event.target.value as typeof detailRequirement)}
          >
            <option value="AVAILABLE">Compare all supplied details</option>
            <option value="SERIES">Require every series</option>
            <option value="SHOTS">Require every shot</option>
            <option value="BOTH">Require every series and shot</option>
          </select>
        </Field>
        <p className="text-xs text-vscode-text-muted">
          Optional shotScores and seriesScores contain scores in shot or series order, starting at 1. Use JSON arrays;
          in CSV, quote the arrays in columns with those names. Scores include recorded corrections; deductions may
          apply only to series or totals. Missing official details cannot be compared. Team series can be compared when
          the results include them.
        </p>
        <Field label='Backup records JSON: [{ "key", "rank" (optional), "totalScore" }]'>
          <textarea
            required
            rows={6}
            value={recordsText}
            onChange={(e) => {
              setRecordsText(e.target.value);
              if (importedProvenance) {
                setImportedProvenance(false);
                setSourceId(undefined);
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
      <EstBackupCapturePanel
        key={`capture-${eventId}`}
        eventId={eventId}
        mapping={fileLayout === 'MAPPED' ? selectedMapping : undefined}
        onCaptured={onCaptured}
      />
      <EstBackupSourcesPanel
        key={eventId}
        eventId={eventId}
        generation={sourceGeneration}
        onSelected={(source) => {
          setRecordsText(JSON.stringify(source.records, null, 2));
          setSourceName(source.sourceName);
          setSourceReference(source.sourceReference);
          setSourceId(source.id);
          setImportedProvenance(true);
          setError(null);
        }}
      />
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
            <details className="mt-2">
              <summary>Comparison details</summary>
              {run.items.map((item) => (
                <div key={item.key} className="my-2">
                  <b>
                    {item.name} ({item.key}): {item.status}
                  </b>
                  <p>
                    Total: {item.officialTotalScore ?? 'Unavailable'} / {item.backupTotalScore ?? 'Missing'} · Rank:{' '}
                    {item.officialRank ?? '-'} / {item.backupRank ?? '-'}
                  </p>
                  {!item.detailChecks && <p>Historical aggregate comparison; no detail checks recorded.</p>}
                  {item.detailChecks?.map((check) => (
                    <div key={check.kind}>
                      <span>
                        {check.kind}: {check.status}
                        {check.required ? ' (required)' : ''}
                      </span>
                      {check.values.length > 0 && (
                        <table className="w-full text-left">
                          <thead>
                            <tr>
                              <th>Position</th>
                              <th>Official</th>
                              <th>Backup</th>
                            </tr>
                          </thead>
                          <tbody>
                            {check.values.map((value) => (
                              <tr
                                key={value.position}
                                className={value.official === value.backup ? '' : 'text-vscode-warning'}
                              >
                                <td>{value.position}</td>
                                <td>{value.official ?? 'Unavailable'}</td>
                                <td>{value.backup ?? 'Missing'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </details>
            {(run.resultKind === 'INDIVIDUAL' || run.resultScope === 'FINAL') && run.verified && (
              <EstBackupResultChecksPanel run={run} />
            )}
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

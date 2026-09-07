import { EvidenceFilesPanel } from './EvidenceFilesPanel';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileSearch, Link, Plus, RefreshCw, ShieldAlert } from 'lucide-react';

import { targetExaminationsService } from '@/renderer/services';
import type {
  AppendTargetExaminationEntryPayload,
  TargetExaminationCaseDto,
  TargetExaminationEntryTypeDto,
  TargetExaminationEvidenceTypeDto,
  TargetExaminationIssueKindDto,
  TargetExaminationScopePayload,
} from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

export interface TargetExaminationLaneOption {
  laneId: string;
  label: string;
  firingPointNumber: number | null;
  athleteName?: string;
}

interface TargetExaminationsPanelProps {
  primaryScope?: TargetExaminationScopePayload;
  additionalScopes?: readonly TargetExaminationScopePayload[];
  lanes?: readonly TargetExaminationLaneOption[];
  defaultLaneId?: string;
}

const ISSUE_OPTIONS: ReadonlyArray<{
  value: TargetExaminationIssueKindDto;
  label: string;
  ruleReferences: string;
}> = [
  { value: 'SIGHTING_COMPLAINT', label: 'Sighting complaint', ruleReferences: 'ISSF 6.10.5, 6.10.8' },
  { value: 'NO_SHOT_INDICATION', label: 'No shot indication', ruleReferences: 'ISSF 6.10.8, 6.10.9.3' },
  { value: 'UNEXPECTED_ZERO', label: 'Unexpected zero in Final', ruleReferences: 'ISSF 6.17.1.8' },
  { value: 'SCORE_VALUE_PROTEST', label: 'Shot-value protest', ruleReferences: 'ISSF 6.10.7, 6.10.8' },
  {
    value: 'PAPER_OR_RUBBER_FAILURE',
    label: 'Paper or rubber failure',
    ruleReferences: 'ISSF 6.10.6, 6.10.8',
  },
  { value: 'SINGLE_TARGET_FAILURE', label: 'Single target failure', ruleReferences: 'ISSF 6.10.9.2' },
  { value: 'RANGE_TARGET_FAILURE', label: 'Range target failure', ruleReferences: 'ISSF 6.10.9.1' },
  { value: 'OTHER', label: 'Other target issue', ruleReferences: 'ISSF 6.10.8' },
];

const EVIDENCE_OPTIONS: ReadonlyArray<{ value: TargetExaminationEvidenceTypeDto; label: string }> = [
  { value: 'CONTROL_SHEET', label: 'Control sheet' },
  { value: 'BACKING_CARD', label: 'Backing card' },
  { value: 'BACKING_TARGET', label: 'Backing target' },
  { value: 'WITNESS_STRIP', label: 'Witness strip' },
  { value: 'RUBBER_BAND', label: 'Rubber band' },
  { value: 'RANGE_INCIDENT_REPORT', label: 'Range Incident Report' },
  { value: 'EST_LOG_PRINT', label: 'EST LOG print' },
  { value: 'EST_COMPUTER_RECORD', label: 'EST computer record' },
  { value: 'TARGET_FACE', label: 'Target face or frame' },
  { value: 'OTHER', label: 'Other evidence' },
];

export function TargetExaminationsPanel({
  primaryScope,
  additionalScopes = [],
  lanes = [],
  defaultLaneId,
}: TargetExaminationsPanelProps) {
  const [cases, setCases] = useState<TargetExaminationCaseDto[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showEntry, setShowEntry] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeScopeKey = useRef('');
  const scopeKey = primaryScope ? `${primaryScope.scopeType}:${primaryScope.scopeId}` : 'ALL';
  activeScopeKey.current = scopeKey;

  const loadCases = useCallback(async () => {
    const requestedScopeKey = scopeKey;
    setLoading(true);
    setError(null);
    try {
      const response = primaryScope
        ? await targetExaminationsService.listByScope({
            scopeType: primaryScope.scopeType,
            scopeId: primaryScope.scopeId,
          })
        : await targetExaminationsService.listAll();
      if (!response.success) throw new Error(response.error.message);
      if (activeScopeKey.current !== requestedScopeKey) return;
      setCases(response.data);
      setSelectedCaseId((current) => {
        if (current && response.data.some((examination) => examination.id === current)) return current;
        return (
          [...response.data].reverse().find((examination) => examination.status === 'OPEN')?.id ??
          response.data.at(-1)?.id ??
          null
        );
      });
    } catch (caught) {
      if (activeScopeKey.current === requestedScopeKey) setError(errorMessage(caught, 'Failed to load examinations'));
    } finally {
      if (activeScopeKey.current === requestedScopeKey) setLoading(false);
    }
  }, [primaryScope?.scopeId, primaryScope?.scopeType, scopeKey]);

  useEffect(() => {
    setSelectedCaseId(null);
    setShowCreate(false);
    setShowEvidence(false);
    setShowEntry(false);
    void loadCases();
  }, [loadCases]);

  const selectedCase = useMemo(
    () => cases.find((examination) => examination.id === selectedCaseId) ?? null,
    [cases, selectedCaseId],
  );
  const activeHolds = cases.filter((examination) => examination.evidenceHoldActive).length;

  const runMutation = useCallback(
    async (operation: () => Promise<TargetExaminationCaseDto>): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        const examination = await operation();
        setSelectedCaseId(examination.id);
        await loadCases();
        return true;
      } catch (caught) {
        setError(errorMessage(caught, 'Failed to update the target examination'));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [loadCases],
  );

  const currentScopes = useMemo(
    () => uniqueScopes([...(primaryScope ? [primaryScope] : []), ...additionalScopes]),
    [additionalScopes, primaryScope],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileSearch size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Target Examination</h2>
            {activeHolds > 0 && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-vscode-warning/60 px-1.5 py-0.5 text-[11px] font-semibold text-vscode-warning">
                <ShieldAlert size={12} aria-hidden="true" /> {activeHolds} hold{activeHolds === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            ISSF 6.10.5–6.10.9 evidence ledger. Cases start with a data hold; decisions do not alter scores.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void loadCases()}>
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </Button>
          {primaryScope && (
            <Button size="sm" disabled={saving} onClick={() => setShowCreate(true)}>
              <Plus size={14} aria-hidden="true" /> Open case
            </Button>
          )}
        </div>
      </header>

      {error && <div className="border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error">{error}</div>}
      {loading && <p className="text-[13px] text-vscode-text-muted">Loading target examinations…</p>}

      {showCreate && primaryScope && (
        <CreateCaseForm
          scopes={currentScopes}
          lanes={lanes}
          defaultLaneId={defaultLaneId}
          saving={saving}
          onCancel={() => setShowCreate(false)}
          onCreate={async (input) => {
            const succeeded = await runMutation(async () => {
              const response = await targetExaminationsService.create(input);
              if (!response.success) throw new Error(response.error.message);
              return response.data;
            });
            if (succeeded) setShowCreate(false);
          }}
        />
      )}

      {!loading && cases.length === 0 && !showCreate && (
        <div className="border-y border-vscode-border py-5">
          <p className="text-[13px] font-medium text-vscode-text">No target-examination cases</p>
          <p className="mt-1 text-xs text-vscode-text-muted">
            {primaryScope
              ? 'Open a case before examining EST records or collecting the items listed by ISSF 6.10.8.'
              : 'No target-examination cases have been recorded in a competition or event workspace.'}
          </p>
        </div>
      )}

      {cases.length > 0 && (
        <div className="grid min-h-80 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-[3px] border border-vscode-border bg-vscode-bg">
            <div className="border-b border-vscode-border px-3 py-2 text-xs font-semibold text-vscode-text">
              Cases ({cases.length})
            </div>
            <div className="max-h-[42rem] overflow-auto">
              {[...cases].reverse().map((examination) => (
                <button
                  key={examination.id}
                  type="button"
                  className={`block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 ${
                    examination.id === selectedCaseId ? 'bg-vscode-highlight' : 'hover:bg-vscode-bg-hover'
                  }`}
                  onClick={() => setSelectedCaseId(examination.id)}
                >
                  <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-vscode-text">
                    {examination.summary}
                    <span className={statusClass(examination)}>{statusLabel(examination)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-vscode-text-muted">
                    {examination.firingPointNumber ? `Firing point ${examination.firingPointNumber}` : 'Range-wide'} ·{' '}
                    {formatEnum(examination.issueKind)}
                  </span>
                  <span className="block text-xs text-vscode-dimmed">
                    {new Date(examination.occurredAt).toLocaleString()} · {examination.id.slice(0, 8)}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0">
            {selectedCase ? (
              <CaseDetail
                examination={selectedCase}
                additionalScopes={additionalScopes}
                saving={saving}
                showEvidence={showEvidence}
                showEntry={showEntry}
                onShowEvidence={() => {
                  setShowEvidence(true);
                  setShowEntry(false);
                }}
                onShowEntry={() => {
                  setShowEntry(true);
                  setShowEvidence(false);
                }}
                onCancelForm={() => {
                  setShowEvidence(false);
                  setShowEntry(false);
                }}
                onMutate={runMutation}
              />
            ) : (
              <p className="text-xs text-vscode-text-muted">Select a target-examination case.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function CreateCaseForm({
  scopes,
  lanes,
  defaultLaneId,
  saving,
  onCreate,
  onCancel,
}: {
  scopes: TargetExaminationScopePayload[];
  lanes: readonly TargetExaminationLaneOption[];
  defaultLaneId?: string;
  saving: boolean;
  onCreate: (input: Parameters<typeof targetExaminationsService.create>[0]) => Promise<void>;
  onCancel: () => void;
}) {
  const initialIssue = ISSUE_OPTIONS[1]!;
  const [issueKind, setIssueKind] = useState<TargetExaminationIssueKindDto>(initialIssue.value);
  const [occurredAt, setOccurredAt] = useState(toLocalInputValue(new Date()));
  const [laneId, setLaneId] = useState(defaultLaneId ?? '');
  const [relayNumber, setRelayNumber] = useState('');
  const [athleteName, setAthleteName] = useState('');
  const [shotId, setShotId] = useState('');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [ruleReferences, setRuleReferences] = useState(initialIssue.ruleReferences);
  const [openedBy, setOpenedBy] = useState('');
  const selectedLane = lanes.find((lane) => lane.laneId === laneId);

  return (
    <form
      className="space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const relay = relayNumber ? Number(relayNumber) : undefined;
        void onCreate({
          scopes,
          issueKind,
          occurredAt: new Date(occurredAt).toISOString(),
          ...(laneId ? { laneId } : {}),
          ...(selectedLane?.firingPointNumber ? { firingPointNumber: selectedLane.firingPointNumber } : {}),
          ...(relay ? { relayNumber: relay } : {}),
          ...(athleteName.trim() ? { athleteName: athleteName.trim() } : {}),
          ...(shotId.trim() ? { shotId: shotId.trim() } : {}),
          summary,
          details,
          ruleReferences,
          openedBy,
        });
      }}
    >
      <h3 className="text-[13px] font-semibold text-vscode-text">Open target-examination case</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Issue">
          <select
            value={issueKind}
            onChange={(event) => {
              const issue = ISSUE_OPTIONS.find((option) => option.value === event.target.value)!;
              setIssueKind(issue.value);
              setRuleReferences(issue.ruleReferences);
            }}
            className={inputClass}
          >
            {ISSUE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Occurred at">
          <input
            required
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Target Lane">
          <select
            value={laneId}
            onChange={(event) => {
              const nextLaneId = event.target.value;
              setLaneId(nextLaneId);
              const lane = lanes.find((option) => option.laneId === nextLaneId);
              if (lane?.athleteName) setAthleteName(lane.athleteName);
            }}
            className={inputClass}
          >
            <option value="">Range-wide / no Lane</option>
            {lanes.map((lane) => (
              <option key={lane.laneId} value={lane.laneId}>
                {lane.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Relay number">
          <input
            type="number"
            min={1}
            value={relayNumber}
            onChange={(event) => setRelayNumber(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Athlete name">
          <input value={athleteName} onChange={(event) => setAthleteName(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Shot ID or reference">
          <input value={shotId} onChange={(event) => setShotId(event.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Summary">
        <input required value={summary} onChange={(event) => setSummary(event.target.value)} className={inputClass} />
      </Field>
      <Field label="Observed facts">
        <textarea
          required
          rows={3}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Rule references">
          <input
            required
            value={ruleReferences}
            onChange={(event) => setRuleReferences(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Opened by">
          <input
            required
            value={openedBy}
            onChange={(event) => setOpenedBy(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <p className="text-xs text-vscode-warning">Opening a case immediately activates an evidence hold.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          Open case and hold data
        </Button>
      </div>
    </form>
  );
}

function CaseDetail({
  examination,
  additionalScopes,
  saving,
  showEvidence,
  showEntry,
  onShowEvidence,
  onShowEntry,
  onCancelForm,
  onMutate,
}: {
  examination: TargetExaminationCaseDto;
  additionalScopes: readonly TargetExaminationScopePayload[];
  saving: boolean;
  showEvidence: boolean;
  showEntry: boolean;
  onShowEvidence: () => void;
  onShowEntry: () => void;
  onCancelForm: () => void;
  onMutate: (operation: () => Promise<TargetExaminationCaseDto>) => Promise<boolean>;
}) {
  const missingScopes = additionalScopes.filter(
    (candidate) =>
      !examination.scopes.some(
        (scope) => scope.scopeType === candidate.scopeType && scope.scopeId === candidate.scopeId,
      ),
  );

  return (
    <div className="space-y-3">
      <div className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-vscode-text">{examination.summary}</h3>
            <p className="mt-1 text-xs text-vscode-text-muted">
              {formatEnum(examination.issueKind)} · {new Date(examination.occurredAt).toLocaleString()} · Case{' '}
              {examination.id.slice(0, 8)}
            </p>
          </div>
          <span className={`text-xs font-semibold ${statusClass(examination)}`}>{statusLabel(examination)}</span>
        </div>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <Detail
            label="Target"
            value={examination.firingPointNumber ? `Firing point ${examination.firingPointNumber}` : 'Range-wide'}
          />
          <Detail label="Athlete" value={examination.athleteName ?? 'Not recorded'} />
          <Detail label="Shot reference" value={examination.shotId ?? 'Not recorded'} />
          <Detail label="Rules" value={examination.ruleReferences} />
          <Detail label="Opened by" value={examination.openedBy} />
          <Detail label="Scopes" value={examination.scopes.map((scope) => scope.scopeType.toLowerCase()).join(', ')} />
        </dl>
        <p className="mt-3 whitespace-pre-wrap border-t border-vscode-border pt-3 text-[13px] leading-5 text-vscode-text">
          {examination.details}
        </p>
        {examination.status !== 'VOID' && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-vscode-border pt-3">
            <Button
              size="sm"
              variant="secondary"
              disabled={saving || examination.status !== 'OPEN'}
              onClick={onShowEvidence}
            >
              Add evidence
            </Button>
            <Button size="sm" variant="secondary" disabled={saving} onClick={onShowEntry}>
              Record action
            </Button>
          </div>
        )}
      </div>

      {missingScopes.map((scope) => (
        <LinkScopeForm
          key={`${scope.scopeType}:${scope.scopeId}`}
          examination={examination}
          scope={scope}
          saving={saving}
          onMutate={onMutate}
        />
      ))}

      {showEvidence && (
        <EvidenceForm examination={examination} saving={saving} onCancel={onCancelForm} onMutate={onMutate} />
      )}
      {showEntry && <EntryForm examination={examination} saving={saving} onCancel={onCancelForm} onMutate={onMutate} />}

      <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-vscode-text">ISSF workflow guidance</h4>
          <span className="text-[11px] text-vscode-dimmed">Advisory only · {examination.workflow.policyId}</span>
        </div>
        <ul className="mt-2 space-y-2">
          {examination.workflow.steps.map((step) => (
            <li key={step.id} className="border-t border-vscode-border pt-2 text-xs first:border-t-0 first:pt-0">
              <p className="font-semibold text-vscode-text">
                {step.status === 'COMPLETE' ? '✓' : step.status === 'MISSING' ? '○' : '◇'} {step.label}
              </p>
              <p className="text-vscode-text-muted">{step.guidance}</p>
              <p className="text-vscode-dimmed">
                {step.ruleReference} · {formatEnum(step.status)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
        <h4 className="text-xs font-semibold text-vscode-text">Examination items ({examination.evidence.length})</h4>
        {examination.evidence.length === 0 ? (
          <p className="mt-2 text-xs text-vscode-text-muted">No examination items recorded.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {examination.evidence.map((item) => (
              <li
                key={item.id}
                className="border-t border-vscode-border pt-2 text-xs leading-5 first:border-t-0 first:pt-0"
              >
                <p className="font-semibold text-vscode-text">{formatEnum(item.type)}</p>
                <p className="text-vscode-text-muted">{item.description}</p>
                <p className="text-vscode-dimmed">
                  Collected by {item.collectedBy} · {new Date(item.collectedAt).toLocaleString()}
                  {item.reference ? ` · ${item.reference}` : ''}
                </p>
                {item.contentHashSha256 && (
                  <code className="block break-all text-[10px] text-vscode-dimmed">
                    SHA-256 {item.contentHashSha256}
                  </code>
                )}
                <EvidenceFilesPanel
                  caseId={examination.id}
                  evidenceId={item.id}
                  canImport={examination.status === 'OPEN'}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
        <h4 className="text-xs font-semibold text-vscode-text">Audit history ({examination.entries.length})</h4>
        {examination.entries.length === 0 ? (
          <p className="mt-2 text-xs text-vscode-text-muted">The initial evidence hold is active.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {examination.entries.map((entry) => (
              <li
                key={entry.id}
                className="border-t border-vscode-border pt-2 text-xs leading-5 first:border-t-0 first:pt-0"
              >
                <p className="font-semibold text-vscode-text">
                  {formatEnum(entry.type)} · {entry.officialName}
                </p>
                <p className="text-vscode-text-muted">{entry.statement}</p>
                <p className="text-vscode-dimmed">
                  {new Date(entry.recordedAt).toLocaleString()}
                  {entry.ruleReference ? ` · ${entry.ruleReference}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function EvidenceForm({
  examination,
  saving,
  onCancel,
  onMutate,
}: {
  examination: TargetExaminationCaseDto;
  saving: boolean;
  onCancel: () => void;
  onMutate: (operation: () => Promise<TargetExaminationCaseDto>) => Promise<boolean>;
}) {
  const [type, setType] = useState<TargetExaminationEvidenceTypeDto>('CONTROL_SHEET');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [contentHashSha256, setContentHashSha256] = useState('');
  const [collectedBy, setCollectedBy] = useState('');
  const [collectedAt, setCollectedAt] = useState(toLocalInputValue(new Date()));

  return (
    <form
      className="space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const response = await targetExaminationsService.addEvidence({
            caseId: examination.id,
            type,
            description,
            ...(reference.trim() ? { reference: reference.trim() } : {}),
            ...(contentHashSha256.trim() ? { contentHashSha256: contentHashSha256.trim() } : {}),
            collectedBy,
            collectedAt: new Date(collectedAt).toISOString(),
          });
          if (!response.success) throw new Error(response.error.message);
          onCancel();
          return response.data;
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">Add examination item</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Item type">
          <select
            value={type}
            onChange={(event) => setType(event.target.value as TargetExaminationEvidenceTypeDto)}
            className={inputClass}
          >
            {EVIDENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Collected at">
          <input
            required
            type="datetime-local"
            value={collectedAt}
            onChange={(event) => setCollectedAt(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Reference or storage location">
          <input value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Collected by">
          <input
            required
            value={collectedBy}
            onChange={(event) => setCollectedBy(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          required
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="SHA-256 (optional, 64 hexadecimal characters)">
        <input
          value={contentHashSha256}
          onChange={(event) => setContentHashSha256(event.target.value)}
          className={`${inputClass} font-mono`}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          Append evidence
        </Button>
      </div>
    </form>
  );
}

function EntryForm({
  examination,
  saving,
  onCancel,
  onMutate,
}: {
  examination: TargetExaminationCaseDto;
  saving: boolean;
  onCancel: () => void;
  onMutate: (operation: () => Promise<TargetExaminationCaseDto>) => Promise<boolean>;
}) {
  const options = entryOptions(examination);
  const [type, setType] = useState<TargetExaminationEntryTypeDto>(options[0]!.value);
  const [statement, setStatement] = useState('');
  const [ruleReference, setRuleReference] = useState(defaultEntryRule(options[0]!.value, examination));
  const [officialName, setOfficialName] = useState('');

  return (
    <form
      className="space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const payload = {
            caseId: examination.id,
            type,
            statement,
            officialName,
            ...(ruleReference.trim() ? { ruleReference: ruleReference.trim() } : {}),
          } as AppendTargetExaminationEntryPayload;
          const response = await targetExaminationsService.appendEntry(payload);
          if (!response.success) throw new Error(response.error.message);
          onCancel();
          return response.data;
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">Record examination action</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Action">
          <select
            value={type}
            onChange={(event) => {
              const next = event.target.value as TargetExaminationEntryTypeDto;
              setType(next);
              setRuleReference(defaultEntryRule(next, examination));
            }}
            className={inputClass}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Official name">
          <input
            required
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Statement / authorization">
        <textarea
          required
          rows={3}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label={type === 'DECISION' ? 'Rule reference (required)' : 'Rule reference'}>
        <input
          required={type === 'DECISION'}
          value={ruleReference}
          onChange={(event) => setRuleReference(event.target.value)}
          className={inputClass}
        />
      </Field>
      {type === 'HOLD_RELEASED' && (
        <p className="text-xs text-vscode-warning">
          This authorizes Lane removal, session reset, and competition-data cleanup for the case scope.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          Append action
        </Button>
      </div>
    </form>
  );
}

function LinkScopeForm({
  examination,
  scope,
  saving,
  onMutate,
}: {
  examination: TargetExaminationCaseDto;
  scope: TargetExaminationScopePayload;
  saving: boolean;
  onMutate: (operation: () => Promise<TargetExaminationCaseDto>) => Promise<boolean>;
}) {
  const [linkedBy, setLinkedBy] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-[3px] border border-vscode-border bg-vscode-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const response = await targetExaminationsService.linkScope({
            caseId: examination.id,
            scope,
            linkedBy,
            note: `Linked from the current ${scope.scopeType.toLowerCase()} workspace`,
          });
          if (!response.success) throw new Error(response.error.message);
          return response.data;
        });
      }}
    >
      <div className="min-w-52 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-vscode-text">
          <Link size={13} aria-hidden="true" /> Link current {scope.scopeType.toLowerCase()}
        </p>
        <input
          required
          aria-label="Linked by"
          placeholder="Official name"
          value={linkedBy}
          onChange={(event) => setLinkedBy(event.target.value)}
          className={`${inputClass} mt-2`}
        />
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={saving}>
        Link scope
      </Button>
    </form>
  );
}

function entryOptions(
  examination: TargetExaminationCaseDto,
): Array<{ value: TargetExaminationEntryTypeDto; label: string }> {
  if (examination.status === 'CLOSED') {
    return [
      { value: 'REOPENED', label: 'Reopen case and reinstate hold' },
      { value: 'VOID', label: 'Void case' },
    ];
  }
  return [
    { value: 'NOTE', label: 'Note' },
    { value: 'DECISION', label: 'Jury / RTS decision' },
    examination.evidenceHoldActive
      ? { value: 'HOLD_RELEASED', label: 'Release evidence hold' }
      : { value: 'HOLD_REINSTATED', label: 'Reinstate evidence hold' },
    ...(examination.evidenceHoldActive ? [] : [{ value: 'CLOSED' as const, label: 'Close case' }]),
    { value: 'VOID', label: 'Void case' },
  ];
}

function defaultEntryRule(type: TargetExaminationEntryTypeDto, examination: TargetExaminationCaseDto): string {
  if (type === 'HOLD_RELEASED') return 'ISSF 6.10.8.3';
  if (type === 'DECISION') return examination.ruleReferences;
  return '';
}

function uniqueScopes(scopes: readonly TargetExaminationScopePayload[]): TargetExaminationScopePayload[] {
  const seen = new Set<string>();
  return scopes.filter((scope) => {
    const key = `${scope.scopeType}:${scope.scopeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
      {label}
      {children}
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-vscode-dimmed">{label}</dt>
      <dd className="mt-0.5 text-vscode-text">{value}</dd>
    </div>
  );
}

function statusLabel(examination: TargetExaminationCaseDto): string {
  if (examination.status === 'VOID') return 'Void';
  if (examination.evidenceHoldActive) return 'Hold active';
  return examination.status === 'CLOSED' ? 'Closed' : 'Hold released';
}

function statusClass(examination: TargetExaminationCaseDto): string {
  if (examination.status === 'VOID') return 'text-vscode-error';
  if (examination.evidenceHoldActive) return 'text-vscode-warning';
  return 'text-vscode-success';
}

function formatEnum(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}

function toLocalInputValue(value: Date): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const inputClass =
  'min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';

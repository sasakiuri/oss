import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  adjudicationCasesService,
  finalRecoveriesService,
  incidentReportsService,
  protestsService,
  rangeInterruptionsService,
  scoringDecisionsService,
  targetExaminationsService,
} from '@/renderer/services';
import type { AdjudicationCaseDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

interface ArtifactCandidate {
  key: string;
  type: AdjudicationCaseDto['links'][number]['artifactType'];
  id: string;
  relation: AdjudicationCaseDto['links'][number]['relation'];
  label: string;
}

export function AdjudicationCasesPanel({ eventId }: { eventId: string }) {
  const [cases, setCases] = useState<AdjudicationCaseDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [candidates, setCandidates] = useState<ArtifactCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        caseResponse,
        incidentResponse,
        protestResponse,
        decisionResponse,
        recoveryResponse,
        interruptionResponse,
        examinationResponse,
      ] = await Promise.all([
        adjudicationCasesService.list({ scopeType: 'EVENT', scopeId: eventId }),
        incidentReportsService.listByEvent({ eventId }),
        protestsService.list({ scopeType: 'EVENT', scopeId: eventId }),
        scoringDecisionsService.listByEvent({ eventId }),
        finalRecoveriesService.listByEvent({ eventId }),
        rangeInterruptionsService.listByScope({ scopeType: 'EVENT', scopeId: eventId }),
        targetExaminationsService.listByScope({ scopeType: 'EVENT', scopeId: eventId }),
      ]);
      if (!caseResponse.success) throw new Error(caseResponse.error.message);
      if (!incidentResponse.success) throw new Error(incidentResponse.error.message);
      if (!protestResponse.success) throw new Error(protestResponse.error.message);
      if (!decisionResponse.success) throw new Error(decisionResponse.error.message);
      if (!recoveryResponse.success) throw new Error(recoveryResponse.error.message);
      if (!interruptionResponse.success) throw new Error(interruptionResponse.error.message);
      if (!examinationResponse.success) throw new Error(examinationResponse.error.message);
      setCases(caseResponse.data);
      setSelectedId((current) =>
        caseResponse.data.some((value) => value.id === current) ? current : (caseResponse.data[0]?.id ?? ''),
      );
      setCandidates([
        ...incidentResponse.data.reports.map((report) => ({
          key: `RANGE_INCIDENT_REPORT:${report.id}`,
          type: 'RANGE_INCIDENT_REPORT' as const,
          id: report.id,
          relation: 'REPORT' as const,
          label: `IR ${report.serialNumber} · ${report.athleteName ?? 'General range incident'}`,
        })),
        ...interruptionResponse.data.map((interruption) => ({
          key: `RANGE_INTERRUPTION:${interruption.id}`,
          type: 'RANGE_INTERRUPTION' as const,
          id: interruption.id,
          relation: 'RELATED' as const,
          label: `${interruption.cause} · ${interruption.summary}`,
        })),
        ...examinationResponse.data.map((examination) => ({
          key: `TARGET_EXAMINATION:${examination.id}`,
          type: 'TARGET_EXAMINATION' as const,
          id: examination.id,
          relation: 'EVIDENCE' as const,
          label: `${examination.issueKind} · ${examination.summary}`,
        })),
        ...decisionResponse.data.decisions.map((decision) => ({
          key: `SCORING_DECISION:${decision.id}`,
          type: 'SCORING_DECISION' as const,
          id: decision.id,
          relation: 'DECISION' as const,
          label: `${decision.type} · ${decision.publicRemark}`,
        })),
        ...protestResponse.data.map((protest) => ({
          key: `PROTEST:${protest.id}`,
          type: 'PROTEST' as const,
          id: protest.id,
          relation: 'PROTEST' as const,
          label: `${protest.kind} · ${protest.subject}`,
        })),
        ...recoveryResponse.data.map((recovery) => ({
          key: `FINAL_RECOVERY:${recovery.id}`,
          type: 'FINAL_RECOVERY' as const,
          id: recovery.id,
          relation: 'RECOVERY' as const,
          label: `${recovery.incidentType} · ${recovery.summary}`,
        })),
      ]);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => cases.find((value) => value.id === selectedId) ?? null, [cases, selectedId]);
  const replaceCase = (value: AdjudicationCaseDto) => {
    setCases((current) => current.map((item) => (item.id === value.id ? value : item)));
    setSelectedId(value.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-vscode-text">Adjudication cases</h2>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Optional case files link independent decisions, reports, and protests without changing their own ledgers.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}

      <CreateCaseForm
        eventId={eventId}
        disabled={saving}
        onSaving={setSaving}
        onError={setError}
        onCreated={(value) => {
          setCases((current) => [...current, value]);
          setSelectedId(value.id);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[3px] border border-vscode-border">
          {cases.length === 0 && !loading && <p className="p-3 text-xs text-vscode-text-muted">No case files.</p>}
          {cases.map((value) => (
            <button
              key={value.id}
              type="button"
              className={`block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 ${
                value.id === selectedId ? 'bg-vscode-highlight' : 'hover:bg-vscode-bg-hover'
              }`}
              onClick={() => setSelectedId(value.id)}
            >
              <span className="block text-[13px] font-medium text-vscode-text">{value.subject}</span>
              <span className="mt-0.5 block text-xs text-vscode-text-muted">
                {value.category} · {value.status} · {value.links.length} links
              </span>
            </button>
          ))}
        </div>

        {selected && (
          <CaseDetail
            value={selected}
            candidates={candidates}
            saving={saving}
            setSaving={setSaving}
            setError={setError}
            onChanged={replaceCase}
          />
        )}
      </div>
    </div>
  );
}

function CreateCaseForm({
  eventId,
  disabled,
  onSaving,
  onError,
  onCreated,
}: {
  eventId: string;
  disabled: boolean;
  onSaving: (value: boolean) => void;
  onError: (value: string | null) => void;
  onCreated: (value: AdjudicationCaseDto) => void;
}) {
  const [category, setCategory] = useState<AdjudicationCaseDto['category']>('RANGE_INCIDENT');
  const [subject, setSubject] = useState('');
  const [summary, setSummary] = useState('');
  const [officialName, setOfficialName] = useState('');

  return (
    <form
      className="rounded-[3px] border border-vscode-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSaving(true);
        onError(null);
        void adjudicationCasesService
          .create({
            scopeType: 'EVENT',
            scopeId: eventId,
            category,
            subject,
            summary,
            openedBy: officialName,
          })
          .then((response) => {
            if (!response.success) throw new Error(response.error.message);
            onCreated(response.data);
            setSubject('');
            setSummary('');
          })
          .catch((caught: unknown) => onError(messageOf(caught)))
          .finally(() => onSaving(false));
      }}
    >
      <p className="text-xs font-semibold text-vscode-text">Open an optional case file</p>
      <div className="mt-2 grid gap-2 md:grid-cols-4">
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as typeof category)}
          className={inputClass}
        >
          {CASE_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <input
          className={inputClass}
          placeholder="Subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Official name"
          value={officialName}
          onChange={(event) => setOfficialName(event.target.value)}
        />
      </div>
      <Button
        className="mt-2"
        size="sm"
        disabled={disabled || !subject.trim() || !summary.trim() || !officialName.trim()}
      >
        Open case
      </Button>
    </form>
  );
}

function CaseDetail({
  value,
  candidates,
  saving,
  setSaving,
  setError,
  onChanged,
}: {
  value: AdjudicationCaseDto;
  candidates: readonly ArtifactCandidate[];
  saving: boolean;
  setSaving: (value: boolean) => void;
  setError: (value: string | null) => void;
  onChanged: (value: AdjudicationCaseDto) => void;
}) {
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('');
  const [ruleReference, setRuleReference] = useState('');
  const [entryType, setEntryType] = useState<AdjudicationCaseDto['entries'][number]['type']>('NOTE');
  const [candidateKey, setCandidateKey] = useState('');
  const availableCandidates = candidates.filter(
    (candidate) =>
      !value.links.some((link) => link.artifactType === candidate.type && link.artifactId === candidate.id),
  );
  const selectedCandidate = availableCandidates.find((candidate) => candidate.key === candidateKey);
  const entryTypes = availableEntryTypes(value.status);

  useEffect(() => {
    if (!entryTypes.includes(entryType)) setEntryType(entryTypes[0] ?? 'NOTE');
  }, [entryType, entryTypes]);

  const run = async (
    operation: () => Promise<{ success: boolean; data?: AdjudicationCaseDto; error?: { message: string } }>,
  ): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const response = await operation();
      if (!response.success || !response.data) throw new Error(response.error?.message ?? 'Case operation failed');
      onChanged(response.data);
      setStatement('');
      setRuleReference('');
      return true;
    } catch (caught) {
      setError(messageOf(caught));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-[3px] border border-vscode-border p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-vscode-text">{value.subject}</h3>
          <span className="text-xs text-vscode-text-muted">{value.status}</span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-vscode-text-muted">{value.summary}</p>
      </div>

      <section>
        <p className="text-xs font-semibold text-vscode-text">Linked official records</p>
        <div className="mt-2 space-y-2">
          {value.links.length === 0 && <p className="text-xs text-vscode-text-muted">No artifacts linked.</p>}
          {value.links.map((link) => (
            <div
              key={link.id}
              className="flex items-start justify-between gap-3 rounded-[3px] border border-vscode-border p-2"
            >
              <div className="min-w-0 text-xs">
                <p className="truncate font-medium text-vscode-text">{link.labelSnapshot}</p>
                <p className="text-vscode-text-muted">
                  {link.artifactType} · {link.relation} · {link.statement}
                </p>
              </div>
              {value.status !== 'CLOSED' && value.status !== 'VOID' && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={saving || !officialName.trim() || !statement.trim()}
                  onClick={() =>
                    void run(() =>
                      adjudicationCasesService.unlinkArtifact({
                        caseId: value.id,
                        linkId: link.id,
                        statement,
                        officialName,
                      }),
                    )
                  }
                >
                  Unlink
                </Button>
              )}
            </div>
          ))}
        </div>
        {value.status !== 'CLOSED' && value.status !== 'VOID' && (
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              value={candidateKey}
              onChange={(event) => setCandidateKey(event.target.value)}
              className={`${inputClass} flex-1`}
            >
              <option value="">Select an official record</option>
              {availableCandidates.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={saving || !selectedCandidate || !officialName.trim() || !statement.trim()}
              onClick={() => {
                if (!selectedCandidate) return;
                void run(() =>
                  adjudicationCasesService.linkArtifact({
                    caseId: value.id,
                    artifactType: selectedCandidate.type,
                    artifactId: selectedCandidate.id,
                    relation: selectedCandidate.relation,
                    labelSnapshot: selectedCandidate.label,
                    statement,
                    officialName,
                  }),
                ).then((succeeded) => {
                  if (succeeded) setCandidateKey('');
                });
              }}
            >
              Link record
            </Button>
          </div>
        )}
      </section>

      <section>
        <p className="text-xs font-semibold text-vscode-text">Case history</p>
        <div className="mt-2 space-y-1 text-xs text-vscode-text-muted">
          {value.entries.length === 0 && <p>No appended entries.</p>}
          {value.entries.map((entry) => (
            <p key={entry.id}>
              {entry.type} · {entry.statement} · {entry.officialName} · {new Date(entry.occurredAt).toLocaleString()}
            </p>
          ))}
        </div>
      </section>

      <div className="grid gap-2 md:grid-cols-2">
        <input
          className={inputClass}
          placeholder="Official name"
          value={officialName}
          onChange={(event) => setOfficialName(event.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Statement / link reason"
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
        />
        <select
          value={entryType}
          onChange={(event) => setEntryType(event.target.value as typeof entryType)}
          className={inputClass}
        >
          {entryTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          className={inputClass}
          placeholder="Rule reference (optional)"
          value={ruleReference}
          onChange={(event) => setRuleReference(event.target.value)}
        />
      </div>
      <Button
        size="sm"
        disabled={saving || value.status === 'VOID' || !officialName.trim() || !statement.trim()}
        onClick={() =>
          void run(() =>
            adjudicationCasesService.appendEntry({
              caseId: value.id,
              type: entryType,
              statement,
              officialName,
              ...(ruleReference.trim() ? { ruleReference } : {}),
            }),
          )
        }
      >
        Append case entry
      </Button>
    </div>
  );
}

const CASE_CATEGORIES: readonly AdjudicationCaseDto['category'][] = [
  'SCORING',
  'RANGE_INCIDENT',
  'PROTEST',
  'MALFUNCTION',
  'TARGET_FAILURE',
  'COMMAND_ERROR',
  'FINAL',
  'OTHER',
];

function availableEntryTypes(status: AdjudicationCaseDto['status']): AdjudicationCaseDto['entries'][number]['type'][] {
  if (status === 'VOID') return ['NOTE'];
  if (status === 'CLOSED') return ['NOTE', 'REOPENED'];
  if (status === 'RESOLVED') return ['NOTE', 'CLOSED', 'REOPENED', 'VOID'];
  if (status === 'REFERRED') return ['NOTE', 'RESOLVED', 'VOID'];
  return ['NOTE', 'REFERRED', 'RESOLVED', 'VOID'];
}

const inputClass =
  'min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
import { type AsyncAction, useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import type { AdjudicationCaseDto } from '@/shared/ipc/contracts';

import { CaseListItem } from '../shared/cases/CaseListItem';
import { useEntryTypeSelection } from '../shared/cases/useEntryTypeSelection';
import { Button } from '../shared/common/Button';
import { paddedInputClass } from '../shared/common/formClasses';
import { InlineError } from '../shared/common/InlineError';

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
  const { busy: saving, error, setError, run } = useAsyncAction();

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
      const listed = unwrap(caseResponse);
      const incidents = unwrap(incidentResponse);
      const protests = unwrap(protestResponse);
      const decisions = unwrap(decisionResponse);
      const recoveries = unwrap(recoveryResponse);
      const interruptions = unwrap(interruptionResponse);
      const examinations = unwrap(examinationResponse);
      setCases(listed);
      setSelectedId((current) => (listed.some((value) => value.id === current) ? current : (listed[0]?.id ?? '')));
      setCandidates([
        ...incidents.reports.map((report) => ({
          key: `RANGE_INCIDENT_REPORT:${report.id}`,
          type: 'RANGE_INCIDENT_REPORT' as const,
          id: report.id,
          relation: 'REPORT' as const,
          label: `IR ${report.serialNumber} · ${report.athleteName ?? 'General range incident'}`,
        })),
        ...interruptions.map((interruption) => ({
          key: `RANGE_INTERRUPTION:${interruption.id}`,
          type: 'RANGE_INTERRUPTION' as const,
          id: interruption.id,
          relation: 'RELATED' as const,
          label: `${interruption.cause} · ${interruption.summary}`,
        })),
        ...examinations.map((examination) => ({
          key: `TARGET_EXAMINATION:${examination.id}`,
          type: 'TARGET_EXAMINATION' as const,
          id: examination.id,
          relation: 'EVIDENCE' as const,
          label: `${examination.issueKind} · ${examination.summary}`,
        })),
        ...decisions.decisions.map((decision) => ({
          key: `SCORING_DECISION:${decision.id}`,
          type: 'SCORING_DECISION' as const,
          id: decision.id,
          relation: 'DECISION' as const,
          label: `${decision.type} · ${decision.publicRemark}`,
        })),
        ...protests.map((protest) => ({
          key: `PROTEST:${protest.id}`,
          type: 'PROTEST' as const,
          id: protest.id,
          relation: 'PROTEST' as const,
          label: `${protest.kind} · ${protest.subject}`,
        })),
        ...recoveries.map((recovery) => ({
          key: `FINAL_RECOVERY:${recovery.id}`,
          type: 'FINAL_RECOVERY' as const,
          id: recovery.id,
          relation: 'RECOVERY' as const,
          label: `${recovery.incidentType} · ${recovery.summary}`,
        })),
      ]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [eventId, setError]);

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

      {error && <InlineError>{error}</InlineError>}

      <CreateCaseForm
        eventId={eventId}
        disabled={saving}
        run={run}
        onCreated={(value) => {
          setCases((current) => [...current, value]);
          setSelectedId(value.id);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[3px] border border-vscode-border">
          {cases.length === 0 && !loading && <p className="p-3 text-xs text-vscode-text-muted">No case files.</p>}
          {cases.map((value) => (
            <CaseListItem key={value.id} selected={value.id === selectedId} onSelect={() => setSelectedId(value.id)}>
              <span className="block text-[13px] font-medium text-vscode-text">{value.subject}</span>
              <span className="mt-0.5 block text-xs text-vscode-text-muted">
                {value.category} · {value.status} · {value.links.length} links
              </span>
            </CaseListItem>
          ))}
        </div>

        {selected && (
          <CaseDetail value={selected} candidates={candidates} saving={saving} run={run} onChanged={replaceCase} />
        )}
      </div>
    </div>
  );
}

function CreateCaseForm({
  eventId,
  disabled,
  run,
  onCreated,
}: {
  eventId: string;
  disabled: boolean;
  run: AsyncAction['run'];
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
        void run(async () => {
          const created = unwrap(
            await adjudicationCasesService.create({
              scopeType: 'EVENT',
              scopeId: eventId,
              category,
              subject,
              summary,
              openedBy: officialName,
            }),
          );
          onCreated(created);
          setSubject('');
          setSummary('');
        });
      }}
    >
      <p className="text-xs font-semibold text-vscode-text">Open an optional case file</p>
      <div className="mt-2 grid gap-2 md:grid-cols-4">
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as typeof category)}
          className={paddedInputClass}
        >
          {CASE_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <input
          className={paddedInputClass}
          placeholder="Subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <input
          className={paddedInputClass}
          placeholder="Summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
        <input
          className={paddedInputClass}
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
  run,
  onChanged,
}: {
  value: AdjudicationCaseDto;
  candidates: readonly ArtifactCandidate[];
  saving: boolean;
  run: AsyncAction['run'];
  onChanged: (value: AdjudicationCaseDto) => void;
}) {
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('');
  const [ruleReference, setRuleReference] = useState('');
  const entryTypes = availableEntryTypes(value.status);
  const [entryType, setEntryType] = useEntryTypeSelection(entryTypes, 'NOTE');
  const [candidateKey, setCandidateKey] = useState('');
  const availableCandidates = candidates.filter(
    (candidate) =>
      !value.links.some((link) => link.artifactType === candidate.type && link.artifactId === candidate.id),
  );
  const selectedCandidate = availableCandidates.find((candidate) => candidate.key === candidateKey);

  const change = (operation: () => ReturnType<typeof adjudicationCasesService.appendEntry>): Promise<boolean> =>
    run(async () => {
      onChanged(unwrap(await operation(), 'Case operation failed'));
      setStatement('');
      setRuleReference('');
    });

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
                    void change(() =>
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
              className={`${paddedInputClass} flex-1`}
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
                void change(() =>
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
          className={paddedInputClass}
          placeholder="Official name"
          value={officialName}
          onChange={(event) => setOfficialName(event.target.value)}
        />
        <input
          className={paddedInputClass}
          placeholder="Statement / link reason"
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
        />
        <select
          value={entryType}
          onChange={(event) => setEntryType(event.target.value as typeof entryType)}
          className={paddedInputClass}
        >
          {entryTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          className={paddedInputClass}
          placeholder="Rule reference (optional)"
          value={ruleReference}
          onChange={(event) => setRuleReference(event.target.value)}
        />
      </div>
      <Button
        size="sm"
        disabled={saving || value.status === 'VOID' || !officialName.trim() || !statement.trim()}
        onClick={() =>
          void change(() =>
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

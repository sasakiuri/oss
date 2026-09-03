import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crosshair, RefreshCw, TriangleAlert } from 'lucide-react';
import type { FinalSeriesAdjudicationCapability, FinalSeriesIncidentConsequence } from '@sasakiuri/saika-rules';

import { incidentReportsService, irregularShotCasesService, scoringDecisionsService } from '@/renderer/services';
import type { IrregularShotCaseDto, RangeIncidentReportDto, ScoringDecisionDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

interface Props {
  eventId: string;
  competitionId: string;
  resultScope: 'QUALIFICATION' | 'FINAL';
  lanes: readonly { laneId: string; label: string }[];
  adjudication?: FinalSeriesAdjudicationCapability;
  disabled?: boolean;
}

export function IrregularShotCasesPanel({
  eventId,
  competitionId,
  resultScope,
  lanes,
  adjudication,
  disabled = false,
}: Props) {
  const [cases, setCases] = useState<IrregularShotCaseDto[]>([]);
  const [reports, setReports] = useState<RangeIncidentReportDto[]>([]);
  const [decisions, setDecisions] = useState<ScoringDecisionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<IrregularShotCaseDto['kind']>('CROSS_FIRE');
  const [ruleReference, setRuleReference] = useState('ISSF 6.11.6');
  const [subjectLaneId, setSubjectLaneId] = useState('');
  const [adjacentLaneIds, setAdjacentLaneIds] = useState<Set<string>>(() => new Set());
  const [occurredAt, setOccurredAt] = useState(() => toLocalDateTime(new Date()));
  const [windowStartAt, setWindowStartAt] = useState(() => toLocalDateTime(new Date(Date.now() - 15_000)));
  const [windowEndAt, setWindowEndAt] = useState(() => toLocalDateTime(new Date(Date.now() + 15_000)));
  const [summary, setSummary] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedPolicy = adjudication?.incidents.find((incident) => incident.kind === kind) ?? null;
  const kindOptions = useMemo(
    () => [
      { value: 'CROSS_FIRE' as const, label: 'Crossfire' },
      { value: 'EXCESS_SHOTS' as const, label: 'Excess shots' },
      { value: 'DISPUTED_SHOT' as const, label: 'Disputed shot' },
      ...(adjudication?.incidents.map((incident) => ({ value: incident.kind, label: incident.label })) ?? []),
    ],
    [adjudication],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [caseResponse, reportResponse, decisionResponse] = await Promise.all([
        irregularShotCasesService.list({ eventId, resultScope }),
        incidentReportsService.listByEvent({ eventId }),
        scoringDecisionsService.listByEvent({ eventId, resultScope }),
      ]);
      if (!caseResponse.success) throw new Error(caseResponse.error.message);
      if (!reportResponse.success) throw new Error(reportResponse.error.message);
      if (!decisionResponse.success) throw new Error(decisionResponse.error.message);
      setCases(caseResponse.data.filter((value) => value.competitionId === competitionId));
      setReports(reportResponse.data.reports.filter((report) => !report.voided));
      setDecisions(
        decisionResponse.data.decisions.filter(
          (decision) =>
            decision.active &&
            decision.type !== 'REVOCATION' &&
            (!decision.sourceCompetitionId || decision.sourceCompetitionId === competitionId),
        ),
      );
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }, [competitionId, eventId, resultScope]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!subjectLaneId && lanes[0]) setSubjectLaneId(lanes[0].laneId);
  }, [lanes, subjectLaneId]);

  const createCase = async () => {
    if (!subjectLaneId || !summary.trim() || !officialName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await irregularShotCasesService.create({
        eventId,
        competitionId,
        resultScope,
        kind,
        subjectLaneId,
        adjacentLaneIds: [...adjacentLaneIds],
        windowStartAt: new Date(windowStartAt).toISOString(),
        windowEndAt: new Date(windowEndAt).toISOString(),
        summary: summary.trim(),
        ruleReference: ruleReference.trim(),
        openedBy: officialName.trim(),
        occurredAt: new Date(occurredAt).toISOString(),
      });
      if (!response.success) throw new Error(response.error.message);
      setCases((current) => [...current, response.data]);
      setSummary('');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const laneLabels = useMemo(() => new Map(lanes.map((lane) => [lane.laneId, lane.label])), [lanes]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Crosshair size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Irregular shot cases</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Evidence workspace for irregular shots and optional RulePack-defined Final incidents. Detection and evidence
            never apply a score decision automatically.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <div className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</div>}

      <section className="rounded-[3px] border border-vscode-border p-3">
        <p className="text-xs font-semibold text-vscode-text">Open a review case</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className={labelClass}>
            Case type
            <select
              className={inputClass}
              value={kind}
              onChange={(event) => {
                const next = event.target.value as typeof kind;
                setKind(next);
                setRuleReference(
                  adjudication?.incidents.find((incident) => incident.kind === next)?.ruleReference ??
                    defaultIrregularRuleReference(next),
                );
              }}
            >
              {kindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Subject Lane
            <select
              className={inputClass}
              value={subjectLaneId}
              onChange={(event) => setSubjectLaneId(event.target.value)}
            >
              <option value="">Select Lane</option>
              {lanes.map((lane) => (
                <option key={lane.laneId} value={lane.laneId}>
                  {lane.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Reporting official
            <input
              className={inputClass}
              value={officialName}
              onChange={(event) => setOfficialName(event.target.value)}
            />
          </label>
          <label className={labelClass}>
            ISSF rule reference
            <input
              className={inputClass}
              value={ruleReference}
              onChange={(event) => setRuleReference(event.target.value)}
            />
          </label>
          <label className={labelClass}>
            Occurred at
            <input
              type="datetime-local"
              className={inputClass}
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </label>
          <label className={labelClass}>
            Evidence window start
            <input
              type="datetime-local"
              className={inputClass}
              value={windowStartAt}
              onChange={(event) => setWindowStartAt(event.target.value)}
            />
          </label>
          <label className={labelClass}>
            Evidence window end
            <input
              type="datetime-local"
              className={inputClass}
              value={windowEndAt}
              onChange={(event) => setWindowEndAt(event.target.value)}
            />
          </label>
        </div>
        {selectedPolicy && (
          <div className="mt-3 border-l-2 border-vscode-warning bg-vscode-warning/5 px-3 py-2 text-xs">
            <p className="font-semibold text-vscode-text">RulePack guidance · {selectedPolicy.ruleReference}</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-vscode-text-muted">
              {selectedPolicy.reviewGuidance.map((item) => (
                <li key={item}>{item}</li>
              ))}
              {selectedPolicy.consequences.map((consequence) => (
                <li key={`${consequence.when}:${consequence.action}`}>{formatConsequence(consequence)}</li>
              ))}
            </ul>
          </div>
        )}
        <fieldset className="mt-3">
          <legend className="text-xs text-vscode-text-muted">Adjacent Lanes to compare</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {lanes
              .filter((lane) => lane.laneId !== subjectLaneId)
              .map((lane) => (
                <label key={lane.laneId} className="flex items-center gap-1.5 text-xs text-vscode-text">
                  <input
                    type="checkbox"
                    checked={adjacentLaneIds.has(lane.laneId)}
                    onChange={(event) =>
                      setAdjacentLaneIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(lane.laneId);
                        else next.delete(lane.laneId);
                        return next;
                      })
                    }
                  />
                  {lane.label}
                </label>
              ))}
          </div>
        </fieldset>
        <label className={`${labelClass} mt-3`}>
          Initial observation
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <Button
          className="mt-3"
          size="sm"
          disabled={disabled || saving || !subjectLaneId || !summary.trim() || !officialName.trim()}
          onClick={() => void createCase()}
        >
          Open case and hold official publication
        </Button>
      </section>

      {!loading && cases.length === 0 && (
        <p className="text-xs text-vscode-text-muted">No cases for this competition.</p>
      )}
      {cases.map((value) => (
        <IrregularShotCaseCard
          key={value.id}
          value={value}
          reports={reports}
          decisions={decisions}
          laneLabels={laneLabels}
          disabled={disabled}
          onChanged={(changed) =>
            setCases((current) => current.map((item) => (item.id === changed.id ? changed : item)))
          }
          onError={setError}
        />
      ))}
    </div>
  );
}

function IrregularShotCaseCard({
  value,
  reports,
  decisions,
  laneLabels,
  disabled,
  onChanged,
  onError,
}: {
  value: IrregularShotCaseDto;
  reports: readonly RangeIncidentReportDto[];
  decisions: readonly ScoringDecisionDto[];
  laneLabels: ReadonlyMap<string, string>;
  disabled: boolean;
  onChanged: (value: IrregularShotCaseDto) => void;
  onError: (message: string | null) => void;
}) {
  const [relation, setRelation] = useState<IrregularShotCaseDto['evidence'][number]['relation']>('CONTEXT');
  const [entryType, setEntryType] = useState<IrregularShotCaseDto['entries'][number]['type']>('NOTE');
  const [resolutionCode, setResolutionCode] =
    useState<NonNullable<IrregularShotCaseDto['entries'][number]['resolutionCode']>>('NO_SCORE_CHANGE');
  const [incidentReportId, setIncidentReportId] = useState('');
  const [decisionIds, setDecisionIds] = useState<Set<string>>(() => new Set());
  const [statement, setStatement] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [saving, setSaving] = useState(false);
  const evidenceIds = new Set(value.evidence.map((item) => `${item.observationId}:${item.relation}`));
  const entryTypes = availableEntryTypes(value.status);

  const run = async (
    operation: () => Promise<{ success: boolean; data?: IrregularShotCaseDto; error?: { message: string } }>,
  ) => {
    setSaving(true);
    onError(null);
    try {
      const response = await operation();
      if (!response.success || !response.data) throw new Error(response.error?.message ?? 'Operation failed');
      onChanged(response.data);
      setStatement('');
    } catch (caught) {
      onError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[3px] border border-vscode-border bg-vscode-bg-light p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-vscode-text">
            {value.kind.replaceAll('_', ' ')} · {laneLabels.get(value.subjectLaneId) ?? value.subjectLaneId.slice(0, 8)}
          </p>
          <p className="mt-1 text-xs text-vscode-text-muted">{value.summary}</p>
          <p className="mt-1 text-[11px] text-vscode-text-muted">{value.ruleReference}</p>
        </div>
        <span
          className={
            value.publicationBlocked ? 'text-xs font-semibold text-vscode-warning' : 'text-xs text-vscode-success'
          }
        >
          {value.status}
          {value.publicationBlocked ? ' · publication held' : ''}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="text-vscode-text-muted">
            <tr>
              <th className="pb-1 pr-3">Fired</th>
              <th className="pb-1 pr-3">Lane</th>
              <th className="pb-1 pr-3">Series / shot</th>
              <th className="pb-1 pr-3">Score</th>
              <th className="pb-1">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {value.timeline.map((item) => {
              const linked = evidenceIds.has(`${item.observationId}:${relation}`);
              return (
                <tr key={item.observationId} className="border-t border-vscode-border/60">
                  <td className="py-1.5 pr-3">{new Date(item.firedAt).toLocaleTimeString()}</td>
                  <td className="py-1.5 pr-3">{laneLabels.get(item.laneId) ?? item.laneId.slice(0, 8)}</td>
                  <td className="py-1.5 pr-3">
                    {item.seriesIndex + 1} / {item.shotNumberInSeries}
                  </td>
                  <td className="py-1.5 pr-3">{(item.effectiveScoreX10 / 10).toFixed(1)}</td>
                  <td className="py-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={
                        disabled ||
                        saving ||
                        linked ||
                        !officialName.trim() ||
                        !['OPEN', 'REFERRED'].includes(value.status)
                      }
                      onClick={() =>
                        void run(() =>
                          irregularShotCasesService.addEvidence({
                            caseId: value.id,
                            observationId: item.observationId,
                            relation,
                            officialName: officialName.trim(),
                          }),
                        )
                      }
                    >
                      {linked ? 'Linked' : 'Link'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {value.timeline.length === 0 && (
          <p className="py-2 text-xs text-vscode-warning">No shot observations in this window.</p>
        )}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <label className={labelClass}>
          Evidence relation
          <select
            className={inputClass}
            value={relation}
            onChange={(event) => setRelation(event.target.value as typeof relation)}
          >
            {['SUBJECT', 'POSSIBLE_SOURCE', 'RECIPIENT', 'CONTEXT'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Official name
          <input
            className={inputClass}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
          />
        </label>
        <label className={labelClass}>
          Case action
          <select
            className={inputClass}
            value={entryType}
            onChange={(event) => setEntryType(event.target.value as typeof entryType)}
          >
            {entryTypes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>

      {entryType === 'RESOLVED' && (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className={labelClass}>
            Jury resolution
            <select
              className={inputClass}
              value={resolutionCode}
              onChange={(event) => setResolutionCode(event.target.value as typeof resolutionCode)}
            >
              {RESOLUTION_CODES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Range Incident Report
            <select
              className={inputClass}
              value={incidentReportId}
              onChange={(event) => setIncidentReportId(event.target.value)}
            >
              <option value="">Select report</option>
              {reports.map((report) => (
                <option key={report.id} value={report.id}>
                  {report.serialNumber} · {report.details}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="md:col-span-2">
            <legend className="text-xs text-vscode-text-muted">Active scoring decisions</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {decisions.map((decision) => (
                <label key={decision.id} className="flex items-start gap-1.5 text-xs text-vscode-text">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={decisionIds.has(decision.id)}
                    onChange={(event) =>
                      setDecisionIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(decision.id);
                        else next.delete(decision.id);
                        return next;
                      })
                    }
                  />
                  {decision.type} · {decision.publicRemark}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <label className={`${labelClass} mt-2`}>
        Statement
        <textarea
          className={`${inputClass} min-h-14 resize-y`}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
        />
      </label>
      <Button
        className="mt-2"
        size="sm"
        disabled={
          disabled ||
          saving ||
          !officialName.trim() ||
          !statement.trim() ||
          (entryType === 'RESOLVED' &&
            (!incidentReportId || (resolutionCode !== 'NO_SCORE_CHANGE' && decisionIds.size === 0)))
        }
        onClick={() =>
          void run(() =>
            irregularShotCasesService.appendEntry({
              caseId: value.id,
              type: entryType,
              statement: statement.trim(),
              officialName: officialName.trim(),
              ...(entryType === 'RESOLVED'
                ? { resolutionCode, incidentReportId, scoringDecisionIds: [...decisionIds] }
                : {}),
            }),
          )
        }
      >
        Append case action
      </Button>

      {value.publicationBlocked && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-vscode-warning">
          <TriangleAlert size={13} aria-hidden="true" /> Official publication and Final declaration remain blocked.
        </p>
      )}
    </section>
  );
}

const RESOLUTION_CODES = [
  'EXCESS_IDENTIFIED',
  'EXCESS_UNIDENTIFIED',
  'CROSS_FIRE_CONFIRMED',
  'RECEIVED_CROSS_FIRE_CONFIRMED',
  'SHOT_ANNULLED',
  'SHOT_CREDITED',
  'HIT_PENALTY_APPLIED',
  'DISQUALIFICATION_APPLIED',
  'NO_SCORE_CHANGE',
] as const;

function defaultIrregularRuleReference(kind: IrregularShotCaseDto['kind']): string {
  return kind === 'EXCESS_SHOTS' ? 'ISSF 6.11.5' : 'ISSF 6.11.6';
}

function formatConsequence(consequence: FinalSeriesIncidentConsequence): string {
  const timing = consequence.when.replaceAll('_', ' ').toLowerCase();
  if (consequence.action === 'DISQUALIFY') return `${timing}: disqualify (${consequence.classification}).`;
  const source = consequence.sourceShotTreatment ? `; source shot is ${consequence.sourceShotTreatment}` : '';
  return `${timing}: deduct ${consequence.amount} ${consequence.unit.toLowerCase()}${source}.`;
}

function availableEntryTypes(
  status: IrregularShotCaseDto['status'],
): IrregularShotCaseDto['entries'][number]['type'][] {
  if (status === 'VOID') return ['NOTE'];
  if (status === 'CLOSED') return ['NOTE', 'REOPENED'];
  if (status === 'RESOLVED') return ['NOTE', 'CLOSED', 'REOPENED', 'VOID'];
  if (status === 'REFERRED') return ['NOTE', 'RESOLVED', 'VOID'];
  return ['NOTE', 'REFERRED', 'RESOLVED', 'VOID'];
}

function toLocalDateTime(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

const labelClass = 'flex flex-col gap-1 text-xs text-vscode-text-muted';
const inputClass =
  'min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[13px] text-vscode-text';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

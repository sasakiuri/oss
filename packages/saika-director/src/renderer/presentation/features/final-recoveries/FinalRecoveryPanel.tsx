import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

import { finalOperationsService, finalRecoveriesService } from '@/renderer/services';
import type {
  DirectorLaneSnapshotDto,
  FinalOperationRunDto,
  FinalRecoveryCaseDto,
  FinalRecoveryEntryTypeDto,
  FinalRecoveryIncidentTypeDto,
  FinalRecoveryPhaseDto,
  FinalRecoveryProcedureProfileDto,
} from '@/shared/ipc/contracts';
import type { CompetitionPhase } from '@/shared/mqtt';

import { Button } from '../shared/common/Button';
import { getFinalRecoveryDefaults } from './finalRecoveryDefaults';

interface FinalRecoveryPanelProps {
  competitionId: string;
  competitionTypeId?: string;
  phase: CompetitionPhase;
  lanes: readonly DirectorLaneSnapshotDto[];
  eventId?: string;
  disabled?: boolean;
}

export function FinalRecoveryPanel({
  competitionId,
  competitionTypeId,
  phase,
  lanes,
  eventId,
  disabled = false,
}: FinalRecoveryPanelProps) {
  const [cases, setCases] = useState<FinalRecoveryCaseDto[]>([]);
  const [run, setRun] = useState<FinalOperationRunDto | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [caseResponse, runResponse] = await Promise.all([
        finalRecoveriesService.listByCompetition({ competitionId }),
        finalOperationsService.getByCompetition({ competitionId }),
      ]);
      if (!caseResponse.success) throw new Error(caseResponse.error.message);
      if (!runResponse.success) throw new Error(runResponse.error.message);
      setCases(caseResponse.data);
      setRun(runResponse.data);
      setSelectedId((current) =>
        caseResponse.data.some((value) => value.id === current) ? current : (caseResponse.data.at(-1)?.id ?? ''),
      );
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => cases.find((value) => value.id === selectedId) ?? null, [cases, selectedId]);

  const replaceCase = (value: FinalRecoveryCaseDto) => {
    setCases((current) => current.map((candidate) => (candidate.id === value.id ? value : candidate)));
    setSelectedId(value.id);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Final recovery cases</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Record Jury rulings and resumption conditions here. Stop commands, target examinations, scoring decisions,
            and incident reports remain independent operations.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}

      <CreateRecoveryForm
        competitionId={competitionId}
        competitionTypeId={competitionTypeId}
        eventId={eventId}
        phase={phase}
        lanes={lanes}
        run={run}
        disabled={disabled || saving}
        setSaving={setSaving}
        setError={setError}
        onCreated={(value) => {
          setCases((current) => [...current, value]);
          setSelectedId(value.id);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[3px] border border-vscode-border">
          {cases.length === 0 && !loading && <p className="p-3 text-xs text-vscode-text-muted">No recovery cases.</p>}
          {cases.map((value) => (
            <button
              key={value.id}
              type="button"
              className={`block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 ${
                value.id === selectedId ? 'bg-vscode-highlight' : 'hover:bg-vscode-bg-hover'
              }`}
              onClick={() => setSelectedId(value.id)}
            >
              <span className="block text-[13px] font-medium text-vscode-text">
                {humanize(value.incidentType)} · {humanize(value.phase)}
              </span>
              <span className="mt-0.5 block truncate text-xs text-vscode-text-muted">
                {value.status} · {value.summary}
              </span>
            </button>
          ))}
        </div>

        {selected && (
          <RecoveryDetail
            key={selected.id}
            value={selected}
            lanes={lanes}
            disabled={disabled || saving}
            setSaving={setSaving}
            setError={setError}
            onChanged={replaceCase}
          />
        )}
      </div>
    </div>
  );
}

function CreateRecoveryForm({
  competitionId,
  competitionTypeId,
  eventId,
  phase,
  lanes,
  run,
  disabled,
  setSaving,
  setError,
  onCreated,
}: {
  competitionId: string;
  competitionTypeId?: string;
  eventId?: string;
  phase: CompetitionPhase;
  lanes: readonly DirectorLaneSnapshotDto[];
  run: FinalOperationRunDto | null;
  disabled: boolean;
  setSaving: (value: boolean) => void;
  setError: (value: string | null) => void;
  onCreated: (value: FinalRecoveryCaseDto) => void;
}) {
  const defaults = getFinalRecoveryDefaults(competitionTypeId, phase);
  const [procedureProfile, setProcedureProfile] = useState<FinalRecoveryProcedureProfileDto>(
    () => defaults.procedureProfile,
  );
  const [incidentType, setIncidentType] = useState<FinalRecoveryIncidentTypeDto>('MALFUNCTION');
  const [recoveryPhase, setRecoveryPhase] = useState<FinalRecoveryPhaseDto>(() => defaults.phase);
  const [affectedLaneIds, setAffectedLaneIds] = useState<Set<string>>(() => new Set());
  const [summary, setSummary] = useState('');
  const [officialName, setOfficialName] = useState('');
  const singleLaneRequired = is25mMalfunction(procedureProfile, incidentType);

  useEffect(() => {
    const next = getFinalRecoveryDefaults(competitionTypeId, phase);
    setProcedureProfile(next.procedureProfile);
    setRecoveryPhase(next.phase);
  }, [competitionTypeId, phase]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const currentStep = run?.currentStep?.step;
      const response = await finalRecoveriesService.create({
        competitionId,
        ...(eventId ? { eventId } : {}),
        ...(run ? { finalRunId: run.id } : {}),
        ...(currentStep
          ? { scriptStepId: currentStep.id, scriptStepSnapshot: `${currentStep.actor}: ${currentStep.text}` }
          : {}),
        procedureProfile,
        incidentType,
        phase: recoveryPhase,
        affectedLaneIds: [...affectedLaneIds],
        summary,
        openedBy: officialName,
      });
      if (!response.success) throw new Error(response.error.message);
      onCreated(response.data);
      setSummary('');
      setAffectedLaneIds(new Set());
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[3px] border border-vscode-border p-3">
      <p className="text-xs font-semibold text-vscode-text">Open an immutable recovery record</p>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <label className={labelClass}>
          Procedure profile
          <select
            value={procedureProfile}
            onChange={(event) => setProcedureProfile(event.target.value as typeof procedureProfile)}
            className={inputClass}
          >
            {PROFILES.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Incident
          <select
            value={incidentType}
            onChange={(event) => setIncidentType(event.target.value as typeof incidentType)}
            className={inputClass}
          >
            {INCIDENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Final phase
          <select
            value={recoveryPhase}
            onChange={(event) => setRecoveryPhase(event.target.value as typeof recoveryPhase)}
            className={inputClass}
          >
            {RECOVERY_PHASES.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {lanes.map((lane) => (
          <label key={lane.laneId} className="flex items-center gap-2 text-xs text-vscode-text">
            <input
              type="checkbox"
              checked={affectedLaneIds.has(lane.laneId)}
              onChange={(event) =>
                setAffectedLaneIds((current) =>
                  singleLaneRequired && event.target.checked
                    ? new Set([lane.laneId])
                    : toggleSet(current, lane.laneId, event.target.checked),
                )
              }
            />
            {laneLabel(lane)}
          </label>
        ))}
        {lanes.length === 0 && (
          <p className="text-xs text-vscode-text-muted">No Lane is required for a range-wide record.</p>
        )}
      </div>
      {singleLaneRequired && (
        <p className="mt-2 text-[11px] text-vscode-text-muted">
          A 25m Final malfunction claim is tracked for exactly one finalist/Lane.
        </p>
      )}
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className={labelClass}>
          Observed facts
          <input value={summary} onChange={(event) => setSummary(event.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Opening official
          <input
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {run?.currentStep && (
        <p className="mt-2 text-[11px] text-vscode-text-muted">
          Snapshot: {run.currentStep.step.actor} · {run.currentStep.step.text}
        </p>
      )}
      <Button
        className="mt-3"
        size="sm"
        disabled={
          disabled || !summary.trim() || !officialName.trim() || (singleLaneRequired && affectedLaneIds.size !== 1)
        }
        onClick={() => void submit()}
      >
        Open recovery case
      </Button>
    </div>
  );
}

function RecoveryDetail({
  value,
  lanes,
  disabled,
  setSaving,
  setError,
  onChanged,
}: {
  value: FinalRecoveryCaseDto;
  lanes: readonly DirectorLaneSnapshotDto[];
  disabled: boolean;
  setSaving: (value: boolean) => void;
  setError: (value: string | null) => void;
  onChanged: (value: FinalRecoveryCaseDto) => void;
}) {
  const options = availableEntryTypes(value.status);
  const [type, setType] = useState<FinalRecoveryEntryTypeDto>(options[0] ?? 'NOTE');
  const [statement, setStatement] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [ruleReference, setRuleReference] = useState(value.guidance.ruleReferences[0] ?? '');
  const [classification, setClassification] = useState(value.guidance.classifications[0] ?? 'OTHER');
  const [remedy, setRemedy] = useState(value.guidance.remedies[0] ?? 'OTHER');
  const [remainingTimeSeconds, setRemainingTimeSeconds] = useState('');
  const [grantedTimeSeconds, setGrantedTimeSeconds] = useState('');
  const [shotCount, setShotCount] = useState('');

  useEffect(() => {
    if (!options.includes(type)) setType(options[0] ?? 'NOTE');
  }, [options, type]);

  const append = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await finalRecoveriesService.appendEntry({
        caseId: value.id,
        type,
        statement,
        officialName,
        ...(ruleReference.trim() ? { ruleReference } : {}),
        ...(type === 'JURY_RULING' ? { classification } : {}),
        ...(type === 'REMEDY_AUTHORIZED' ? { remedy } : {}),
        ...(remainingTimeSeconds ? { remainingTimeSeconds: Number(remainingTimeSeconds) } : {}),
        ...(type === 'REMEDY_AUTHORIZED' && grantedTimeSeconds
          ? { grantedTimeSeconds: Number(grantedTimeSeconds) }
          : {}),
        ...(type === 'REMEDY_AUTHORIZED' && shotCount ? { shotCount: Number(shotCount) } : {}),
      });
      if (!response.success) throw new Error(response.error.message);
      onChanged(response.data);
      setStatement('');
      setRemainingTimeSeconds('');
      setGrantedTimeSeconds('');
      setShotCount('');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-[3px] border border-vscode-border p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-vscode-text">{humanize(value.incidentType)}</h3>
          <span className="text-xs font-medium text-vscode-text-muted">{value.status}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-vscode-text-muted">{value.summary}</p>
        <p className="mt-1 text-[11px] text-vscode-text-muted">
          {value.affectedLaneIds.length > 0
            ? value.affectedLaneIds.map((id) => laneLabelById(lanes, id)).join(', ')
            : 'Range-wide / no Lane selected'}
          {value.scriptStepSnapshot ? ` · ${value.scriptStepSnapshot}` : ''}
        </p>
      </div>

      <section className="rounded-[3px] border border-vscode-border bg-vscode-bg-light p-3">
        <p className="text-xs font-semibold text-vscode-text">
          ISSF {value.guidance.ruleReferences.join(', ')} · decision aid
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-vscode-text-muted">
          {value.guidance.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-vscode-text-muted">{formatLimits(value.guidance.limits)}</p>
      </section>

      <section>
        <p className="text-xs font-semibold text-vscode-text">Append-only recovery history</p>
        <div className="mt-2 space-y-2">
          {value.entries.length === 0 && <p className="text-xs text-vscode-text-muted">No actions recorded.</p>}
          {value.entries.map((entry) => (
            <div
              key={entry.id}
              className="border-l-2 border-vscode-border pl-3 text-xs leading-5 text-vscode-text-muted"
            >
              <span className="font-medium text-vscode-text">{humanize(entry.type)}</span>
              {entry.classification ? ` · ${humanize(entry.classification)}` : ''}
              {entry.remedy ? ` · ${humanize(entry.remedy)}` : ''}
              {' · '}
              {entry.statement} · {entry.officialName}
            </div>
          ))}
        </div>
      </section>

      {value.status !== 'VOID' && options.length > 0 && (
        <section className="space-y-2">
          <div className="grid gap-2 md:grid-cols-2">
            <label className={labelClass}>
              Action
              <select
                value={type}
                onChange={(event) => setType(event.target.value as typeof type)}
                className={inputClass}
              >
                {options.map((entryType) => (
                  <option key={entryType} value={entryType}>
                    {humanize(entryType)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Official
              <input
                value={officialName}
                onChange={(event) => setOfficialName(event.target.value)}
                className={inputClass}
              />
            </label>
            {type === 'JURY_RULING' && (
              <label className={labelClass}>
                Classification
                <select
                  value={classification}
                  onChange={(event) => setClassification(event.target.value as typeof classification)}
                  className={inputClass}
                >
                  {value.guidance.classifications.map((item) => (
                    <option key={item} value={item}>
                      {humanize(item)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {type === 'REMEDY_AUTHORIZED' && (
              <label className={labelClass}>
                Authorized remedy
                <select
                  value={remedy}
                  onChange={(event) => setRemedy(event.target.value as typeof remedy)}
                  className={inputClass}
                >
                  {value.guidance.remedies.map((item) => (
                    <option key={item} value={item}>
                      {humanize(item)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={labelClass}>
              Statement
              <input value={statement} onChange={(event) => setStatement(event.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Rule reference
              <input
                value={ruleReference}
                onChange={(event) => setRuleReference(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <NumberField label="Remaining sec." value={remainingTimeSeconds} onChange={setRemainingTimeSeconds} />
            {type === 'REMEDY_AUTHORIZED' && (
              <>
                <NumberField label="Granted sec." value={grantedTimeSeconds} onChange={setGrantedTimeSeconds} />
                <NumberField label="Authorized shots" value={shotCount} onChange={setShotCount} />
              </>
            )}
          </div>
          <Button
            size="sm"
            variant={type === 'VOID' ? 'danger' : 'primary'}
            disabled={disabled || !officialName.trim() || !statement.trim()}
            onClick={() => void append()}
          >
            Append recovery action
          </Button>
        </section>
      )}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={labelClass}>
      {label}
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function availableEntryTypes(status: FinalRecoveryCaseDto['status']): FinalRecoveryEntryTypeDto[] {
  switch (status) {
    case 'OPEN':
      return ['STOP_RECORDED', 'JURY_RULING', 'NOTE', 'VOID'];
    case 'STOPPED':
      return ['JURY_RULING', 'NOTE', 'VOID'];
    case 'RULING_RECORDED':
      return ['REMEDY_AUTHORIZED', 'NOTE', 'VOID'];
    case 'RECOVERY_AUTHORIZED':
      return ['REMEDY_AUTHORIZED', 'RESUMED', 'COMPLETED', 'NOTE', 'VOID'];
    case 'RESUMED':
      return ['COMPLETED', 'NOTE', 'VOID'];
    case 'COMPLETED':
      return ['NOTE', 'VOID'];
    case 'VOID':
      return [];
  }
}

function is25mMalfunction(
  profile: FinalRecoveryProcedureProfileDto,
  incidentType: FinalRecoveryIncidentTypeDto,
): boolean {
  return incidentType === 'MALFUNCTION' && (profile === 'PISTOL_25M_RAPID_FIRE' || profile === 'PISTOL_25M_WOMEN');
}

function toggleSet(current: Set<string>, id: string, included: boolean): Set<string> {
  const next = new Set(current);
  if (included) next.add(id);
  else next.delete(id);
  return next;
}

function formatLimits(limits: FinalRecoveryCaseDto['guidance']['limits']): string {
  const values = [
    limits.malfunctionAllowancePerFinal ? `allowance ${limits.malfunctionAllowancePerFinal}/Final` : null,
    limits.repairLimitSeconds ? `repair ≤ ${limits.repairLimitSeconds}s` : null,
    limits.readyLimitSeconds ? `ready ≤ ${limits.readyLimitSeconds}s` : null,
    limits.incorrectCommandAdditionalSeconds ? `additional ${limits.incorrectCommandAdditionalSeconds}s` : null,
    limits.longDelayThresholdSeconds ? `long delay > ${limits.longDelayThresholdSeconds}s` : null,
    limits.sightingTimeSeconds ? `sighting ${limits.sightingTimeSeconds}s` : null,
  ].filter(Boolean);
  return values.length > 0 ? `Structured limits: ${values.join(' · ')}` : 'No fixed numeric limit in this guidance.';
}

function laneLabel(lane: DirectorLaneSnapshotDto): string {
  const point = lane.firingPointNumber ? `FP ${lane.firingPointNumber}` : lane.laneAlias || lane.laneId.slice(0, 8);
  return lane.assignment?.athlete ? `${point} · ${lane.assignment.athlete.name}` : point;
}

function laneLabelById(lanes: readonly DirectorLaneSnapshotDto[], laneId: string): string {
  const lane = lanes.find((candidate) => candidate.laneId === laneId);
  return lane ? laneLabel(lane) : laneId.slice(0, 8);
}

function humanize(value: string): string {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const PROFILES: readonly FinalRecoveryProcedureProfileDto[] = [
  'RIFLE_PISTOL_10M_50M',
  'RIFLE_PISTOL_10M_50M_MIXED_TEAM',
  'PISTOL_25M_RAPID_FIRE',
  'PISTOL_25M_WOMEN',
  'GENERAL',
];
const INCIDENT_TYPES: readonly FinalRecoveryIncidentTypeDto[] = [
  'MALFUNCTION',
  'EST_FAILURE',
  'INCORRECT_COMMAND',
  'IRREGULAR_CASE',
];
const RECOVERY_PHASES: readonly FinalRecoveryPhaseDto[] = [
  'SIGHTING',
  'MATCH_SINGLE',
  'MATCH_SERIES',
  'SHOOT_OFF',
  'OTHER',
];
const labelClass = 'text-xs text-vscode-text-muted';
const inputClass =
  'mt-1 block min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Wrench } from 'lucide-react';

import { qualificationMalfunctionsService } from '@/renderer/services';
import type {
  AppendQualificationMalfunctionEntryPayload,
  DirectorLaneSnapshotDto,
  QualificationMalfunctionCaseDto,
} from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

interface QualificationMalfunctionPanelProps {
  readonly competitionId: string;
  readonly eventId: string;
  readonly relayNumber: number;
  readonly lanes: readonly DirectorLaneSnapshotDto[];
  readonly supportsExceptionalMatchParts: boolean;
  readonly disabled?: boolean;
}

interface EligibleLane {
  readonly value: DirectorLaneSnapshotDto;
  readonly participantId: string;
  readonly athleteLabel: string;
  readonly laneChannel: number | null;
}

type LaneMalfunctionSignal = NonNullable<DirectorLaneSnapshotDto['qualificationMalfunctionSignal']>;
type LaneMalfunctionSignalContext = NonNullable<LaneMalfunctionSignal['context']>;

interface LaneDeclaration {
  readonly lane: EligibleLane & { readonly laneChannel: number };
  readonly signal: LaneMalfunctionSignal & {
    readonly signalId: string;
    readonly context: LaneMalfunctionSignalContext;
    readonly signalledAt: string;
  };
}

export function QualificationMalfunctionPanel({
  competitionId,
  eventId,
  relayNumber,
  lanes,
  supportsExceptionalMatchParts,
  disabled = false,
}: QualificationMalfunctionPanelProps) {
  const [cases, setCases] = useState<QualificationMalfunctionCaseDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await qualificationMalfunctionsService.listByCompetition({ competitionId });
      if (!response.success) throw new Error(response.error.message);
      setCases(response.data);
      setSelectedId((current) =>
        response.data.some((value) => value.id === current) ? current : (response.data.at(-1)?.id ?? ''),
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
  const linkedSignalIds = useMemo(
    () => new Set(cases.flatMap((value) => (value.sourceSignalId ? [value.sourceSignalId] : []))),
    [cases],
  );
  const replaceCase = (value: QualificationMalfunctionCaseDto) => {
    setCases((current) => current.map((candidate) => (candidate.id === value.id ? value : candidate)));
    setSelectedId(value.id);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Wrench size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Qualification malfunction cases</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Record the claim, inspection, official determination, authorized remedy, execution evidence, and score
            settlement independently. This record does not send a firing command to a Lane.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}

      <CreateMalfunctionForm
        competitionId={competitionId}
        eventId={eventId}
        relayNumber={relayNumber}
        lanes={lanes}
        linkedSignalIds={linkedSignalIds}
        supportsExceptionalMatchParts={supportsExceptionalMatchParts}
        disabled={disabled || loading || saving}
        setSaving={setSaving}
        setError={setError}
        onCreated={(value) => {
          setCases((current) => [...current, value]);
          setSelectedId(value.id);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[3px] border border-vscode-border">
          {cases.length === 0 && !loading && (
            <p className="p-3 text-xs text-vscode-text-muted">No malfunction cases.</p>
          )}
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
                FP {value.laneChannelSnapshot} · {value.participantNameSnapshot}
              </span>
              <span className="mt-0.5 block truncate text-xs text-vscode-text-muted">
                {humanize(value.status)} · {humanize(value.claimMode)} · {value.summary}
              </span>
            </button>
          ))}
        </div>

        {selected && (
          <MalfunctionDetail
            key={selected.id}
            value={selected}
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

function CreateMalfunctionForm({
  competitionId,
  eventId,
  relayNumber,
  lanes,
  linkedSignalIds,
  supportsExceptionalMatchParts,
  disabled,
  setSaving,
  setError,
  onCreated,
}: Omit<QualificationMalfunctionPanelProps, 'disabled'> & {
  linkedSignalIds: ReadonlySet<string>;
  disabled: boolean;
  setSaving: (value: boolean) => void;
  setError: (value: string | null) => void;
  onCreated: (value: QualificationMalfunctionCaseDto) => void;
}) {
  const eligibleLanes = useMemo(
    () => lanes.flatMap((lane) => toEligibleLane(lane, competitionId)),
    [competitionId, lanes],
  );
  const declarations = useMemo(
    () => eligibleLanes.flatMap((lane) => toLaneDeclaration(lane, competitionId)),
    [competitionId, eligibleLanes],
  );
  const [selectedDeclaration, setSelectedDeclaration] = useState<LaneDeclaration | null>(null);
  const [laneId, setLaneId] = useState('');
  const [claimMode, setClaimMode] = useState<'CLAIM' | 'DOCUMENTATION_ONLY'>('CLAIM');
  const [laneChannel, setLaneChannel] = useState('1');
  const [stageIndex, setStageIndex] = useState('0');
  const [seriesIndex, setSeriesIndex] = useState('0');
  const [recordedShots, setRecordedShots] = useState('0');
  const [exceptionalPart, setExceptionalPart] = useState<'' | '1' | '2'>('');
  const [summary, setSummary] = useState('');
  const [openedBy, setOpenedBy] = useState('');
  const selectedDeclarationAlreadyLinked = Boolean(
    selectedDeclaration && linkedSignalIds.has(selectedDeclaration.signal.signalId),
  );

  const useDeclaration = (declaration: LaneDeclaration) => {
    const { lane, signal } = declaration;
    setSelectedDeclaration(declaration);
    setLaneId(lane.value.laneId);
    setLaneChannel(String(lane.laneChannel));
    setStageIndex(String(signal.context.stageIndex));
    setSeriesIndex(String(signal.context.seriesIndex));
    setRecordedShots(String(signal.context.recordedShots));
    setSummary(signal.message ?? 'Possible firearm malfunction declared by Lane.');
  };

  const selectLane = useCallback(
    (nextLaneId: string) => {
      setSelectedDeclaration(null);
      setLaneId(nextLaneId);
      const lane = eligibleLanes.find((candidate) => candidate.value.laneId === nextLaneId)?.value;
      const selected = eligibleLanes.find((candidate) => candidate.value.laneId === nextLaneId);
      if (selected?.laneChannel !== null && selected?.laneChannel !== undefined) {
        setLaneChannel(String(selected.laneChannel));
      }
      if (!lane?.competitionState) return;
      setStageIndex(String(lane.competitionState.currentStage.index));
      setSeriesIndex(String(lane.competitionState.currentSeries.index));
      setRecordedShots(String(lane.competitionState.currentSeries.shotsRecorded));
    },
    [eligibleLanes],
  );

  const useManualEntry = () => selectLane(laneId);

  useEffect(() => {
    if (eligibleLanes.some((candidate) => candidate.value.laneId === laneId)) return;
    selectLane(eligibleLanes[0]?.value.laneId ?? '');
  }, [eligibleLanes, laneId, selectLane]);

  const submit = async () => {
    const lane = eligibleLanes.find((candidate) => candidate.value.laneId === laneId);
    if (!lane) return;
    setSaving(true);
    setError(null);
    try {
      const laneState = lane.value.competitionState;
      const timedState = lane.value.timedTargetState;
      const signal = selectedDeclaration?.signal ?? null;
      const exposureIndex = signal
        ? signal.context.exposureIndex
        : timedState?.competitionId === competitionId &&
            timedState.stageIndex === Number(stageIndex) &&
            timedState.seriesIndex === Number(seriesIndex)
          ? timedState.exposureIndex
          : null;
      const laneSessionId = signal
        ? signal.context.sessionId
        : laneState?.competitionId === competitionId
          ? laneState.sessionId
          : null;
      const response = await qualificationMalfunctionsService.create({
        competitionId,
        eventId,
        participantId: signal?.context.participantId ?? lane.participantId,
        laneId: lane.value.laneId,
        laneChannel: Number(laneChannel),
        relayNumber,
        reportSource: signal ? 'LANE_SIGNAL' : 'DIRECTOR_MANUAL',
        ...(signal ? { sourceSignalId: signal.signalId } : {}),
        claimMode,
        stageIndex: Number(stageIndex),
        seriesIndex: Number(seriesIndex),
        recordedShots: Number(recordedShots),
        ...(exposureIndex !== null ? { exposureIndex } : {}),
        ...(laneSessionId ? { laneSessionId } : {}),
        ...(signal ? { occurredAt: signal.signalledAt } : {}),
        ...(exceptionalPart ? { exceptionalMatchPart: Number(exceptionalPart) as 1 | 2 } : {}),
        summary,
        openedBy,
      });
      if (!response.success) throw new Error(response.error.message);
      onCreated(response.data);
      setSummary('');
      setSelectedDeclaration(null);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const numericContextValid =
    Number.isInteger(Number(laneChannel)) &&
    Number(laneChannel) > 0 &&
    [stageIndex, seriesIndex, recordedShots].every((value) => Number.isInteger(Number(value)) && Number(value) >= 0);

  return (
    <div className="rounded-[3px] border border-vscode-border p-3">
      <p className="text-xs font-semibold text-vscode-text">Open an immutable malfunction record</p>
      {declarations.length > 0 && (
        <div className="mt-2 rounded-[3px] border border-vscode-warning/60 bg-vscode-warning/10 p-2.5">
          <p className="text-xs font-semibold text-vscode-text">Lane declarations</p>
          <p className="mt-0.5 text-[11px] leading-4 text-vscode-text-muted">
            Selecting a declaration fixes its athlete and firing context. Opening a case still does not classify the
            malfunction or award a claim.
          </p>
          <ul className="mt-2 space-y-2">
            {declarations.map((declaration) => {
              const linked = linkedSignalIds.has(declaration.signal.signalId);
              return (
                <li
                  key={declaration.signal.signalId}
                  className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-vscode-warning pl-2.5 text-xs"
                >
                  <span className="text-vscode-text">
                    FP {declaration.lane.laneChannel} · {declaration.signal.context.participantName} · stage{' '}
                    {declaration.signal.context.stageIndex + 1}, series {declaration.signal.context.seriesIndex + 1} ·{' '}
                    {humanize(declaration.signal.status)}
                  </span>
                  {linked ? (
                    <span className="font-medium text-vscode-success">Official case already opened</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() => useDeclaration(declaration)}
                    >
                      Use Lane declaration
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {selectedDeclaration && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[3px] bg-vscode-highlight px-2.5 py-2 text-xs">
          <span className="text-vscode-text">
            Lane declaration selected · signalled {new Date(selectedDeclaration.signal.signalledAt).toLocaleString()}
          </span>
          <Button size="sm" variant="secondary" disabled={disabled} onClick={useManualEntry}>
            Use manual entry
          </Button>
        </div>
      )}
      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <label className={labelClass}>
          Athlete / firing point
          <select
            value={laneId}
            disabled={selectedDeclaration !== null}
            onChange={(event) => selectLane(event.target.value)}
            className={inputClass}
          >
            <option value="">Select an assigned Lane</option>
            {eligibleLanes.map((lane) => (
              <option key={lane.value.laneId} value={lane.value.laneId}>
                FP {lane.laneChannel ?? 'unresolved'} · {lane.athleteLabel}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Firing point"
          value={laneChannel}
          onChange={setLaneChannel}
          minimum={1}
          disabled={selectedDeclaration !== null}
        />
        <label className={labelClass}>
          Record mode
          <select
            value={claimMode}
            onChange={(event) => setClaimMode(event.target.value as typeof claimMode)}
            className={inputClass}
          >
            <option value="CLAIM">Claim</option>
            <option value="DOCUMENTATION_ONLY">Documentation only</option>
          </select>
        </label>
        <NumberField
          label="Stage index"
          value={stageIndex}
          onChange={setStageIndex}
          disabled={selectedDeclaration !== null}
        />
        <NumberField
          label="Series index"
          value={seriesIndex}
          onChange={setSeriesIndex}
          disabled={selectedDeclaration !== null}
        />
        <NumberField
          label="Shots already recorded"
          value={recordedShots}
          onChange={setRecordedShots}
          disabled={selectedDeclaration !== null}
        />
        {supportsExceptionalMatchParts && (
          <label className={labelClass}>
            Exceptional match part
            <select
              value={exceptionalPart}
              onChange={(event) => setExceptionalPart(event.target.value as typeof exceptionalPart)}
              className={inputClass}
            >
              <option value="">Not split</option>
              <option value="1">Part 1</option>
              <option value="2">Part 2</option>
            </select>
          </label>
        )}
        <label className={`${labelClass} md:col-span-2`}>
          Observed facts
          <input value={summary} onChange={(event) => setSummary(event.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Opening official
          <input value={openedBy} onChange={(event) => setOpenedBy(event.target.value)} className={inputClass} />
        </label>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-vscode-text-muted">
        {selectedDeclaration
          ? 'Lane-declared context is immutable and is verified again in Director. Claim mode and every later official determination remain separate decisions.'
          : 'Stage, series, and shot count are initialized from the selected Lane but remain editable for delayed official entry. Claim limits and the governing treatment are resolved again from the event Rule Pack in Director.'}
      </p>
      {eligibleLanes.length === 0 && (
        <p className="mt-2 text-xs text-vscode-warning">
          Link a championship event and assign a registered participant to a Lane first.
        </p>
      )}
      <Button
        className="mt-3"
        size="sm"
        disabled={
          disabled ||
          selectedDeclarationAlreadyLinked ||
          !laneId ||
          !summary.trim() ||
          !openedBy.trim() ||
          !numericContextValid
        }
        onClick={() => void submit()}
      >
        Open malfunction case
      </Button>
    </div>
  );
}

function MalfunctionDetail({
  value,
  disabled,
  setSaving,
  setError,
  onChanged,
}: {
  value: QualificationMalfunctionCaseDto;
  disabled: boolean;
  setSaving: (value: boolean) => void;
  setError: (value: string | null) => void;
  onChanged: (value: QualificationMalfunctionCaseDto) => void;
}) {
  const stageRule = value.policySnapshot.stages.find((candidate) => candidate.stageId === value.stageId);
  return (
    <div className="space-y-3 rounded-[3px] border border-vscode-border p-3">
      <div className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Status" value={humanize(value.status)} />
        <Fact label="Athlete" value={`${value.startNumberSnapshot ?? '--'} · ${value.participantNameSnapshot}`} />
        <Fact label="Firing context" value={`FP ${value.laneChannelSnapshot} · relay ${value.relayNumberSnapshot}`} />
        <Fact
          label="Course context"
          value={`${humanize(value.phase)} · stage ${value.stageIndex + 1} · series ${value.seriesIndex + 1}`}
        />
        <Fact label="Claim mode" value={humanize(value.claimMode)} />
        <Fact label="Report source" value={humanize(value.reportSource)} />
        <Fact
          label="Claim assessment"
          value={`${value.claimAssessment.allowed ? 'Available' : 'Unavailable'} · ${humanize(value.claimAssessment.reason)}`}
        />
        <Fact label="Recorded shots" value={`${value.recordedShots}/${value.seriesShotLimit ?? 'unlimited'}`} />
        <Fact label="Treatment" value={stageRule ? humanize(stageRule.allowableTreatment.type) : 'Sighting policy'} />
      </div>
      <p className="text-xs leading-5 text-vscode-text">{value.summary}</p>
      <div className="rounded-[3px] bg-vscode-bg-secondary p-2.5 text-[11px] leading-4 text-vscode-text-muted">
        <p>Rule source: {value.rulePackIdentity?.id ?? 'Local policy snapshot'}</p>
        <p>References: {value.policySnapshot.ruleReferences.join(', ')}</p>
        <p>Required records: {value.policySnapshot.documentation.incidentRecords.join(' / ')}</p>
        {value.sourceSignalId && <p>Lane declaration: {value.sourceSignalId}</p>}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-vscode-text">Append-only history</p>
        {value.entries.length === 0 ? (
          <p className="text-xs text-vscode-text-muted">No entries yet.</p>
        ) : (
          <ol className="space-y-2">
            {value.entries.map((entry) => (
              <li key={entry.id} className="border-l-2 border-vscode-border pl-3 text-xs">
                <div className="font-medium text-vscode-text">
                  {humanize(entry.type)} · {entry.officialName} ({humanize(entry.officialRole)})
                </div>
                <div className="mt-0.5 text-vscode-text-muted">{entry.statement}</div>
                {(entry.classification || entry.remedy || entry.artifactId) && (
                  <div className="mt-0.5 text-[11px] text-vscode-text-muted">
                    {[entry.classification, entry.causeCode, entry.remedy, entry.artifactId]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
                {entry.ruleReference && (
                  <div className="mt-0.5 text-[11px] text-vscode-text-muted">ISSF {entry.ruleReference}</div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {value.status !== 'VOID' && (
        <AppendEntryForm
          value={value}
          disabled={disabled}
          setSaving={setSaving}
          setError={setError}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function AppendEntryForm({
  value,
  disabled,
  setSaving,
  setError,
  onChanged,
}: {
  value: QualificationMalfunctionCaseDto;
  disabled: boolean;
  setSaving: (value: boolean) => void;
  setError: (value: string | null) => void;
  onChanged: (value: QualificationMalfunctionCaseDto) => void;
}) {
  const entryTypes = availableEntryTypes(value);
  const [type, setType] = useState<AppendQualificationMalfunctionEntryPayload['type']>(entryTypes[0] ?? 'NOTE');
  const [statement, setStatement] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [officialRole, setOfficialRole] =
    useState<AppendQualificationMalfunctionEntryPayload['officialRole']>('RANGE_OFFICER');
  const [classification, setClassification] = useState<'ALLOWABLE' | 'NON_ALLOWABLE'>('ALLOWABLE');
  const causes = value.policySnapshot.causes.filter((cause) => cause.classification === classification);
  const [causeCode, setCauseCode] = useState(causes[0]?.code ?? '');
  const [repairSeconds, setRepairSeconds] = useState('');
  const [artifactId, setArtifactId] = useState('');
  const remedy = requiredRemedy(value);

  useEffect(() => {
    if (!entryTypes.includes(type)) setType(entryTypes[0] ?? 'NOTE');
  }, [entryTypes, type]);

  useEffect(() => {
    if (!causes.some((cause) => cause.code === causeCode)) setCauseCode(causes[0]?.code ?? '');
  }, [causeCode, causes]);

  useEffect(() => {
    if (type === 'SCORE_SETTLED') setOfficialRole('RTS_OFFICER');
    else if (type === 'REPAIR_EXTENDED') setOfficialRole('JURY_MEMBER');
  }, [type]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await qualificationMalfunctionsService.appendEntry({
        caseId: value.id,
        type,
        statement,
        officialName,
        officialRole,
        ...(type === 'CLASSIFIED' ? { classification, causeCode } : {}),
        ...(type === 'REMEDY_AUTHORIZED' && remedy ? { remedy: remedy.remedy, shotsToFire: remedy.shotsToFire } : {}),
        ...(type === 'REPAIR_EXTENDED' ? { repairSeconds: Number(repairSeconds) } : {}),
        ...(type === 'EXECUTION_RECORDED' || type === 'SCORE_SETTLED' ? { artifactId } : {}),
      });
      if (!response.success) throw new Error(response.error.message);
      onChanged(response.data);
      setStatement('');
      setArtifactId('');
      setRepairSeconds('');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const conditionalValid =
    (type !== 'CLASSIFIED' || Boolean(causeCode)) &&
    (type !== 'REMEDY_AUTHORIZED' || remedy !== null) &&
    (type !== 'REPAIR_EXTENDED' || (Number.isInteger(Number(repairSeconds)) && Number(repairSeconds) > 0)) &&
    (type !== 'EXECUTION_RECORDED' && type !== 'SCORE_SETTLED' ? true : Boolean(artifactId.trim()));

  return (
    <div className="border-t border-vscode-border pt-3">
      <p className="text-xs font-semibold text-vscode-text">Append an official entry</p>
      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <label className={labelClass}>
          Entry type
          <select value={type} onChange={(event) => setType(event.target.value as typeof type)} className={inputClass}>
            {entryTypes.map((candidate) => (
              <option key={candidate} value={candidate}>
                {humanize(candidate)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Official role
          <select
            value={officialRole}
            onChange={(event) => setOfficialRole(event.target.value as typeof officialRole)}
            className={inputClass}
          >
            {OFFICIAL_ROLES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {humanize(candidate)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Official name
          <input
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Statement
          <input value={statement} onChange={(event) => setStatement(event.target.value)} className={inputClass} />
        </label>

        {type === 'CLASSIFIED' && (
          <>
            <label className={labelClass}>
              Official classification
              <select
                value={classification}
                onChange={(event) => setClassification(event.target.value as typeof classification)}
                className={inputClass}
              >
                <option value="ALLOWABLE">Allowable</option>
                <option value="NON_ALLOWABLE">Non-allowable</option>
              </select>
            </label>
            <label className={`${labelClass} md:col-span-2`}>
              Inspected cause
              <select value={causeCode} onChange={(event) => setCauseCode(event.target.value)} className={inputClass}>
                {causes.map((cause) => (
                  <option key={cause.code} value={cause.code}>
                    {cause.label} ({cause.ruleReference})
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {type === 'REMEDY_AUTHORIZED' && remedy && (
          <div className="md:col-span-2">
            <Fact label="Rule-required remedy" value={`${humanize(remedy.remedy)} · ${remedy.shotsToFire} shots`} />
          </div>
        )}
        {type === 'REPAIR_EXTENDED' && (
          <NumberField label="Extension seconds" value={repairSeconds} onChange={setRepairSeconds} minimum={1} />
        )}
        {(type === 'EXECUTION_RECORDED' || type === 'SCORE_SETTLED') && (
          <label className={`${labelClass} md:col-span-2`}>
            Immutable artifact reference
            <input value={artifactId} onChange={(event) => setArtifactId(event.target.value)} className={inputClass} />
          </label>
        )}
      </div>
      <Button
        className="mt-3"
        size="sm"
        disabled={disabled || entryTypes.length === 0 || !statement.trim() || !officialName.trim() || !conditionalValid}
        onClick={() => void submit()}
      >
        Append entry
      </Button>
    </div>
  );
}

function availableEntryTypes(
  value: QualificationMalfunctionCaseDto,
): AppendQualificationMalfunctionEntryPayload['type'][] {
  switch (value.status) {
    case 'OPEN':
      return ['NOTE', 'INSPECTION_RECORDED', 'VOID'];
    case 'INSPECTED':
      return ['NOTE', 'INSPECTION_RECORDED', 'CLASSIFIED', 'VOID'];
    case 'CLASSIFIED':
      return latestClassification(value) === 'ALLOWABLE'
        ? ['NOTE', 'CLASSIFIED', 'REPAIR_STARTED', 'REMEDY_AUTHORIZED', 'VOID']
        : ['NOTE', 'CLASSIFIED', 'REMEDY_AUTHORIZED', 'VOID'];
    case 'REPAIRING':
      return value.policySnapshot.repair.juryMayExtend
        ? ['NOTE', 'REPAIR_EXTENDED', 'REPAIR_COMPLETED', 'VOID']
        : ['NOTE', 'REPAIR_COMPLETED', 'VOID'];
    case 'REPAIRED':
      return ['NOTE', 'REMEDY_AUTHORIZED', 'VOID'];
    case 'RECOVERY_AUTHORIZED':
      return ['NOTE', 'REMEDY_AUTHORIZED', 'EXECUTION_RECORDED', 'VOID'];
    case 'EXECUTED':
      return ['NOTE', 'SCORE_SETTLED', 'VOID'];
    case 'SETTLED':
      return ['NOTE', 'COMPLETED', 'VOID'];
    case 'COMPLETED':
      return ['NOTE', 'VOID'];
    case 'VOID':
      return [];
  }
}

function requiredRemedy(
  value: QualificationMalfunctionCaseDto,
): { remedy: NonNullable<AppendQualificationMalfunctionEntryPayload['remedy']>; shotsToFire: number } | null {
  if (value.claimMode === 'DOCUMENTATION_ONLY') return { remedy: 'NO_FURTHER_ACTION', shotsToFire: 0 };
  const classification = latestClassification(value);
  if (!classification) return null;
  if (classification === 'NON_ALLOWABLE') return { remedy: 'SCORE_UNFIRED_AS_MISS', shotsToFire: 0 };
  if (value.phase === 'SIGHTING') return { remedy: 'CONTINUE_WITHIN_ORIGINAL_TIME', shotsToFire: 0 };
  const treatment = value.policySnapshot.stages.find(
    (candidate) => candidate.stageId === value.stageId,
  )?.allowableTreatment;
  if (!treatment) return null;
  if (treatment.type === 'CONTINUE_WITHIN_ORIGINAL_TIME') {
    return { remedy: treatment.type, shotsToFire: 0 };
  }
  if (treatment.type === 'REPEAT_FULL_SERIES') {
    return { remedy: treatment.type, shotsToFire: treatment.shots };
  }
  if (value.seriesShotLimit === null) return null;
  return { remedy: treatment.type, shotsToFire: value.seriesShotLimit - value.recordedShots };
}

function latestClassification(value: QualificationMalfunctionCaseDto): 'ALLOWABLE' | 'NON_ALLOWABLE' | null {
  return [...value.entries].reverse().find((entry) => entry.type === 'CLASSIFIED')?.classification ?? null;
}

function toEligibleLane(lane: DirectorLaneSnapshotDto, competitionId: string): EligibleLane[] {
  const athlete = lane.assignment?.athlete;
  if (!athlete || lane.assignment?.competitionId !== competitionId || !isUuid(athlete.id)) return [];
  return [
    {
      value: lane,
      participantId: athlete.id,
      athleteLabel: `${athlete.startNumber} · ${athlete.name}`,
      laneChannel: lane.firingPointNumber,
    },
  ];
}

function toLaneDeclaration(lane: EligibleLane, competitionId: string): LaneDeclaration[] {
  const signal = lane.value.qualificationMalfunctionSignal;
  if (
    lane.laneChannel === null ||
    !signal?.signalId ||
    !signal.context ||
    !signal.signalledAt ||
    signal.laneId !== lane.value.laneId ||
    signal.context.competitionId !== competitionId ||
    signal.context.participantId !== lane.participantId
  ) {
    return [];
  }
  return [
    {
      lane: { ...lane, laneChannel: lane.laneChannel },
      signal: { ...signal, signalId: signal.signalId, context: signal.context, signalledAt: signal.signalledAt },
    },
  ];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function NumberField({
  label,
  value,
  onChange,
  minimum = 0,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimum?: number;
  disabled?: boolean;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input
        type="number"
        min={minimum}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-vscode-text-muted">{label}</div>
      <div className="mt-0.5 text-xs text-vscode-text">{value}</div>
    </div>
  );
}

const OFFICIAL_ROLES = ['RANGE_OFFICER', 'CRO', 'JURY_MEMBER', 'RTS_OFFICER', 'TECHNICAL_OFFICER'] as const;
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-vscode-text-muted';
const inputClass =
  'min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';

function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

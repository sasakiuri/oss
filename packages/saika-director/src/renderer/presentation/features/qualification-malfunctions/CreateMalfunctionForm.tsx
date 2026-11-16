import { useCallback, useEffect, useMemo, useState } from 'react';

import { sentenceCaseLabel } from '@/renderer/presentation/formatters/enumLabel';
import type { CreateQualificationMalfunctionCasePayload, DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { paddedInputClass } from '../shared/common/formClasses';

import { malfunctionLabelClass, NumberField } from './MalfunctionFields';
import { caseFiringContext, type LaneDeclaration, toEligibleLane, toLaneDeclaration } from './malfunctionLanes';

interface CreateMalfunctionFormProps {
  readonly competitionId: string;
  readonly eventId: string;
  readonly relayNumber: number;
  readonly lanes: readonly DirectorLaneSnapshotDto[];
  readonly supportsExceptionalMatchParts: boolean;
  /** Lane declarations that already have a case. */
  readonly linkedSignalIds: ReadonlySet<string>;
  readonly disabled: boolean;
  /** Opens the case; `onSaved` runs once the list shows it. */
  readonly onCreate: (payload: CreateQualificationMalfunctionCasePayload, onSaved: () => void) => Promise<boolean>;
}

/** The form that opens a malfunction case, manually or from a Lane declaration. It owns its draft. */
export function CreateMalfunctionForm({
  competitionId,
  eventId,
  relayNumber,
  lanes,
  linkedSignalIds,
  supportsExceptionalMatchParts,
  disabled,
  onCreate,
}: CreateMalfunctionFormProps) {
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
    const signal = selectedDeclaration?.signal ?? null;
    const { exposureIndex, laneSessionId } = caseFiringContext(
      lane,
      signal,
      competitionId,
      Number(stageIndex),
      Number(seriesIndex),
    );
    await onCreate(
      {
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
      },
      () => {
        setSummary('');
        setSelectedDeclaration(null);
      },
    );
  };

  const numericContextValid =
    Number.isInteger(Number(laneChannel)) &&
    Number(laneChannel) > 0 &&
    [stageIndex, seriesIndex, recordedShots].every((value) => Number.isInteger(Number(value)) && Number(value) >= 0);

  return (
    <div className="rounded-[3px] border border-vscode-border p-3">
      <p className="text-xs font-semibold text-vscode-text">Open a malfunction record</p>
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
                    {sentenceCaseLabel(declaration.signal.status)}
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
        <label className={malfunctionLabelClass}>
          Athlete / firing point
          <select
            value={laneId}
            disabled={selectedDeclaration !== null}
            onChange={(event) => selectLane(event.target.value)}
            className={paddedInputClass}
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
        <label className={malfunctionLabelClass}>
          Record mode
          <select
            value={claimMode}
            onChange={(event) => setClaimMode(event.target.value as typeof claimMode)}
            className={paddedInputClass}
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
          <label className={malfunctionLabelClass}>
            Exceptional match part
            <select
              value={exceptionalPart}
              onChange={(event) => setExceptionalPart(event.target.value as typeof exceptionalPart)}
              className={paddedInputClass}
            >
              <option value="">Not split</option>
              <option value="1">Part 1</option>
              <option value="2">Part 2</option>
            </select>
          </label>
        )}
        <label className={`${malfunctionLabelClass} md:col-span-2`}>
          Observed facts
          <input value={summary} onChange={(event) => setSummary(event.target.value)} className={paddedInputClass} />
        </label>
        <label className={malfunctionLabelClass}>
          Opening official
          <input value={openedBy} onChange={(event) => setOpenedBy(event.target.value)} className={paddedInputClass} />
        </label>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-vscode-text-muted">
        {selectedDeclaration
          ? 'Details reported by Lane cannot be edited. Select the claim mode; record the official ruling after inspection.'
          : 'Stage, series, and shot count come from the selected Lane. Correct them if you are recording an earlier incident. Director checks claim limits and remedies against the event rules.'}
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

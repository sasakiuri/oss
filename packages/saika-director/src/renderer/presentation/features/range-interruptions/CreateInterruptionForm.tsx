// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { rangeInterruptionsService } from '@/renderer/services';
import type {
  RangeInterruptionCauseDto,
  RangeInterruptionPhaseDto,
  RangeInterruptionScopePayload,
} from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { Field, inputClass } from './InterruptionFields';
import { formatDuration, toLocalInputValue } from './interruptionFormatting';
import { type RangeInterruptionLaneOption } from './interruptionPresentationTypes';

export function CreateInterruptionForm({
  scopes,
  lanes,
  defaultLaneId,
  defaultPhase,
  defaultRemainingSeconds,
  qualificationTimedTargetCompetitionTypeId,
  saving,
  onCreate,
  onCancel,
}: {
  scopes: RangeInterruptionScopePayload[];
  lanes: readonly RangeInterruptionLaneOption[];
  defaultLaneId?: string;
  defaultPhase: RangeInterruptionPhaseDto;
  defaultRemainingSeconds: number;
  qualificationTimedTargetCompetitionTypeId?: string;
  saving: boolean;
  onCreate: (input: Parameters<typeof rangeInterruptionsService.create>[0]) => Promise<void>;
  onCancel: () => void;
}) {
  const [cause, setCause] = useState<RangeInterruptionCauseDto>('ATHLETE_NON_FAULT');
  const [phase, setPhase] = useState(defaultPhase);
  const [startedAt, setStartedAt] = useState(toLocalInputValue(new Date()));
  const [remainingSeconds, setRemainingSeconds] = useState(String(Math.max(0, Math.round(defaultRemainingSeconds))));
  const [laneId, setLaneId] = useState(defaultLaneId ?? '');
  const [athleteName, setAthleteName] = useState('');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [openedBy, setOpenedBy] = useState('');
  const selectedLane = lanes.find((lane) => lane.laneId === laneId);
  const causeOption = CAUSE_OPTIONS.find((option) => option.value === cause)!;

  return (
    <form
      className="space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onCreate({
          id: crypto.randomUUID(),
          scopes,
          cause,
          phase,
          startedAt: new Date(startedAt).toISOString(),
          remainingSecondsAtStart: Number(remainingSeconds),
          ...(laneId ? { laneId } : {}),
          ...(selectedLane?.firingPointNumber ? { firingPointNumber: selectedLane.firingPointNumber } : {}),
          ...(athleteName.trim() ? { athleteName: athleteName.trim() } : {}),
          summary,
          details,
          openedBy,
          ...(qualificationTimedTargetCompetitionTypeId &&
          ['ATHLETE_NON_FAULT', 'ALL_TARGET_FAILURE', 'SINGLE_TARGET_FAILURE'].includes(cause) &&
          phase === 'MATCH' &&
          selectedLane?.seriesSnapshot
            ? {
                qualificationTimedTargetContext: {
                  competitionTypeId: qualificationTimedTargetCompetitionTypeId,
                  stageIndex: selectedLane.seriesSnapshot.stageIndex,
                  seriesIndex: selectedLane.seriesSnapshot.seriesIndex,
                  recordedShots: selectedLane.seriesSnapshot.recordedShots,
                  seriesComplete: selectedLane.seriesSnapshot.seriesComplete,
                  laneSnapshotCapturedAt: selectedLane.seriesSnapshot.capturedAt,
                },
              }
            : {}),
        });
      }}
    >
      <h3 className="text-[13px] font-semibold text-vscode-text">Open interruption record</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Cause">
          <select
            value={cause}
            onChange={(event) => setCause(event.target.value as RangeInterruptionCauseDto)}
            className={inputClass}
          >
            {CAUSE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Firing phase">
          <select
            value={phase}
            onChange={(event) => setPhase(event.target.value as RangeInterruptionPhaseDto)}
            className={inputClass}
          >
            <option value="SIGHTING">Sighting</option>
            <option value="MATCH">Match</option>
          </select>
        </Field>
        <Field label="Interruption started at">
          <input
            required
            type="datetime-local"
            step={1}
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Competition time remaining (seconds)">
          <input
            required
            type="number"
            min={0}
            step={1}
            value={remainingSeconds}
            onChange={(event) => setRemainingSeconds(event.target.value)}
            className={inputClass}
          />
          <span className="font-normal text-vscode-dimmed">{formatDuration(Number(remainingSeconds) || 0)}</span>
        </Field>
        <Field label="Affected Lane">
          <select
            value={laneId}
            onChange={(event) => {
              const nextLaneId = event.target.value;
              setLaneId(nextLaneId);
              const lane = lanes.find((candidate) => candidate.laneId === nextLaneId);
              setAthleteName(lane?.athleteName ?? '');
            }}
            className={inputClass}
          >
            <option value="">Range-wide / no Lane control</option>
            {lanes.map((lane) => (
              <option key={lane.laneId} value={lane.laneId}>
                {lane.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Athlete name">
          <input value={athleteName} onChange={(event) => setAthleteName(event.target.value)} className={inputClass} />
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
      <Field label="Opened by">
        <input required value={openedBy} onChange={(event) => setOpenedBy(event.target.value)} className={inputClass} />
      </Field>
      <div className="rounded-[3px] border border-vscode-border px-3 py-2 text-xs leading-5 text-vscode-text-muted">
        <p>{causeOption.ruleReference}</p>
        {qualificationTimedTargetCompetitionTypeId &&
          ['ATHLETE_NON_FAULT', 'ALL_TARGET_FAILURE', 'SINGLE_TARGET_FAILURE'].includes(cause) &&
          phase === 'MATCH' && (
            <p>
              {selectedLane?.seriesSnapshot
                ? `ISSF 8.8.1 series facts will be snapshotted from stage ${selectedLane.seriesSnapshot.stageIndex}, series ${selectedLane.seriesSnapshot.seriesIndex} (${selectedLane.seriesSnapshot.recordedShots}/${selectedLane.seriesSnapshot.maxShots} shots).`
                : 'Select a Lane with a live series snapshot to enable the ISSF 8.8.1 recommendation.'}
            </p>
          )}
        <p className="text-vscode-warning">Opening this ledger activates a data hold but does not stop any Lane.</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          Open record
        </Button>
      </div>
    </form>
  );
}

const CAUSE_OPTIONS: ReadonlyArray<{
  value: RangeInterruptionCauseDto;
  label: string;
  ruleReference: string;
}> = [
  { value: 'ATHLETE_NON_FAULT', label: 'Athlete interruption — no fault', ruleReference: 'ISSF 6.11.3' },
  { value: 'ALL_TARGET_FAILURE', label: 'All targets failed', ruleReference: 'ISSF 6.10.9.1' },
  { value: 'SINGLE_TARGET_FAILURE', label: 'Single target failed', ruleReference: 'ISSF 6.10.9.2' },
  { value: 'FIRING_POINT_MOVE', label: 'Moved to another firing point', ruleReference: 'ISSF 6.11.3.2' },
  { value: 'OTHER', label: 'Other / manual review', ruleReference: 'ISSF 6.11.3' },
];

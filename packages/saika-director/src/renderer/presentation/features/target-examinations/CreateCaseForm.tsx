import { useState } from 'react';

import type { TargetExaminationIssueKindDto, TargetExaminationScopePayload } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { Field, inputClass } from './ExaminationFields';
import { ISSUE_OPTIONS, toLocalInputValue } from './examinationPresentation';
import type { TargetExaminationCommands, TargetExaminationLaneOption } from './examinationTypes';

export function CreateCaseForm({
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
  onCreate: TargetExaminationCommands['create'];
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
        }).then((succeeded) => {
          if (succeeded) onCancel();
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

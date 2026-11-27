import type { FinalSeriesAdjudicationCapability, FinalSeriesIncidentConsequence } from '@sasakiuri/saika-rules';
import { useEffect, useMemo, useState } from 'react';

import type { AsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { irregularShotCasesService } from '@/renderer/services';
import { unwrap } from '@/renderer/services/serviceError';
import type { IrregularShotCaseDto, ResultScope } from '@/shared/ipc/contracts';

import { lowerCaseLabel } from '../../formatters/enumLabel';
import { Button } from '../shared/common/Button';
import { toDateTimeLocalValue } from '../shared/common/dateUtils';
import { inputClass, stackedLabelClass } from '../shared/common/formClasses';
import { toggleSetMember } from '../shared/common/toggleSetMember';

interface CreateIrregularShotCaseFormProps {
  eventId: string;
  competitionId: string;
  resultScope: ResultScope;
  lanes: readonly { laneId: string; label: string }[];
  adjudication?: FinalSeriesAdjudicationCapability;
  disabled: boolean;
  saving: boolean;
  run: AsyncAction['run'];
  onCreated: (value: IrregularShotCaseDto) => void;
}

/** Opens a review case. The panel renders it unconditionally, so its draft lives as long as the panel. */
export function CreateIrregularShotCaseForm({
  eventId,
  competitionId,
  resultScope,
  lanes,
  adjudication,
  disabled,
  saving,
  run,
  onCreated,
}: CreateIrregularShotCaseFormProps) {
  const [kind, setKind] = useState<IrregularShotCaseDto['kind']>('CROSS_FIRE');
  const [ruleReference, setRuleReference] = useState('ISSF 6.11.6');
  const [subjectLaneId, setSubjectLaneId] = useState('');
  const [adjacentLaneIds, setAdjacentLaneIds] = useState<Set<string>>(() => new Set());
  const [occurredAt, setOccurredAt] = useState(() => toDateTimeLocalValue(new Date(), 'minutes'));
  const [windowStartAt, setWindowStartAt] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() - 15_000), 'minutes'),
  );
  const [windowEndAt, setWindowEndAt] = useState(() => toDateTimeLocalValue(new Date(Date.now() + 15_000), 'minutes'));
  const [summary, setSummary] = useState('');
  const [officialName, setOfficialName] = useState('');
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

  useEffect(() => {
    if (!subjectLaneId && lanes[0]) setSubjectLaneId(lanes[0].laneId);
  }, [lanes, subjectLaneId]);

  const createCase = async () => {
    if (!subjectLaneId || !summary.trim() || !officialName.trim()) return;
    await run(async () => {
      const created = unwrap(
        await irregularShotCasesService.create({
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
        }),
      );
      onCreated(created);
      setSummary('');
    });
  };

  return (
    <section className="rounded-[3px] border border-vscode-border p-3">
      <p className="text-xs font-semibold text-vscode-text">Open a review case</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className={stackedLabelClass}>
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
        <label className={stackedLabelClass}>
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
        <label className={stackedLabelClass}>
          Reporting official
          <input
            className={inputClass}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
          />
        </label>
        <label className={stackedLabelClass}>
          ISSF rule reference
          <input
            className={inputClass}
            value={ruleReference}
            onChange={(event) => setRuleReference(event.target.value)}
          />
        </label>
        <label className={stackedLabelClass}>
          Occurred at
          <input
            type="datetime-local"
            className={inputClass}
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </label>
        <label className={stackedLabelClass}>
          Evidence window start
          <input
            type="datetime-local"
            className={inputClass}
            value={windowStartAt}
            onChange={(event) => setWindowStartAt(event.target.value)}
          />
        </label>
        <label className={stackedLabelClass}>
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
                    setAdjacentLaneIds((current) => toggleSetMember(current, lane.laneId, event.target.checked))
                  }
                />
                {lane.label}
              </label>
            ))}
        </div>
      </fieldset>
      <label className={`${stackedLabelClass} mt-3`}>
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
  );
}

function defaultIrregularRuleReference(kind: IrregularShotCaseDto['kind']): string {
  return kind === 'EXCESS_SHOTS' ? 'ISSF 6.11.5' : 'ISSF 6.11.6';
}

function formatConsequence(consequence: FinalSeriesIncidentConsequence): string {
  const timing = lowerCaseLabel(consequence.when);
  if (consequence.action === 'DISQUALIFY') return `${timing}: disqualify (${consequence.classification}).`;
  const source = consequence.sourceShotTreatment ? `; source shot is ${consequence.sourceShotTreatment}` : '';
  return `${timing}: deduct ${consequence.amount} ${consequence.unit.toLowerCase()}${source}.`;
}

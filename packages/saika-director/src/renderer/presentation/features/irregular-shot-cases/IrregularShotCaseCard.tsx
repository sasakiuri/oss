import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import type { IrregularShotCaseDto, RangeIncidentReportDto, ScoringDecisionDto } from '@/shared/ipc/contracts';

import { useEntryTypeSelection } from '../shared/cases/useEntryTypeSelection';
import { Button } from '../shared/common/Button';
import { inputClass, stackedLabelClass } from '../shared/common/formClasses';
import { toggleSetMember } from '../shared/common/toggleSetMember';

import type { IrregularShotCaseCommands } from './useIrregularShotCases';

/** One case with its shot timeline, evidence links and actions. The panel keys it by case. */
export function IrregularShotCaseCard({
  value,
  reports,
  decisions,
  laneLabels,
  disabled,
  commands,
}: {
  value: IrregularShotCaseDto;
  reports: readonly RangeIncidentReportDto[];
  decisions: readonly ScoringDecisionDto[];
  laneLabels: ReadonlyMap<string, string>;
  disabled: boolean;
  commands: Pick<IrregularShotCaseCommands, 'addEvidence' | 'appendEntry'>;
}) {
  const [relation, setRelation] = useState<IrregularShotCaseDto['evidence'][number]['relation']>('CONTEXT');
  const entryTypes = availableEntryTypes(value.status);
  const [entryType, setEntryType] = useEntryTypeSelection(entryTypes, 'NOTE');
  const [resolutionCode, setResolutionCode] =
    useState<NonNullable<IrregularShotCaseDto['entries'][number]['resolutionCode']>>('NO_SCORE_CHANGE');
  const [incidentReportId, setIncidentReportId] = useState('');
  const [decisionIds, setDecisionIds] = useState<Set<string>>(() => new Set());
  const [statement, setStatement] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [saving, setSaving] = useState(false);
  const evidenceIds = new Set(value.evidence.map((item) => `${item.observationId}:${item.relation}`));

  // The card's own busy state disables only this card; the commands report errors in the panel banner.
  const run = async (command: () => Promise<boolean>) => {
    setSaving(true);
    if (await command()) setStatement('');
    setSaving(false);
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
                          commands.addEvidence({
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
        <label className={stackedLabelClass}>
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
        <label className={stackedLabelClass}>
          Official name
          <input
            className={inputClass}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
          />
        </label>
        <label className={stackedLabelClass}>
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
          <label className={stackedLabelClass}>
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
          <label className={stackedLabelClass}>
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
                      setDecisionIds((current) => toggleSetMember(current, decision.id, event.target.checked))
                    }
                  />
                  {decision.type} · {decision.publicRemark}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <label className={`${stackedLabelClass} mt-2`}>
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
          value.status === 'VOID' ||
          !officialName.trim() ||
          !statement.trim() ||
          (entryType === 'RESOLVED' &&
            (!incidentReportId || (resolutionCode !== 'NO_SCORE_CHANGE' && decisionIds.size === 0)))
        }
        onClick={() =>
          void run(() =>
            commands.appendEntry({
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

function availableEntryTypes(
  status: IrregularShotCaseDto['status'],
): IrregularShotCaseDto['entries'][number]['type'][] {
  if (status === 'VOID') return ['NOTE'];
  if (status === 'CLOSED') return ['NOTE', 'REOPENED'];
  if (status === 'RESOLVED') return ['NOTE', 'CLOSED', 'REOPENED', 'VOID'];
  if (status === 'REFERRED') return ['NOTE', 'RESOLVED', 'VOID'];
  return ['NOTE', 'REFERRED', 'RESOLVED', 'VOID'];
}

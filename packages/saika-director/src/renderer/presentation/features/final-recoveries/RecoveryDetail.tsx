import { useState } from 'react';

import { sentenceCaseLabel } from '@/renderer/presentation/formatters/enumLabel';
import type { DirectorLaneSnapshotDto, FinalRecoveryCaseDto } from '@/shared/ipc/contracts';

import { useEntryTypeSelection } from '../shared/cases/useEntryTypeSelection';
import { Button } from '../shared/common/Button';
import { blockInputClass, mutedLabelClass } from '../shared/common/formClasses';
import { laneLabelById } from '../shared/lanes/laneLabels';

import type { FinalRecoveryCommands } from './finalRecoveryCommands';
import { FinalRecoveryFiringPanel } from './FinalRecoveryFiringPanel';
import { allowanceSubjectKind, availableEntryTypes, formatLimits } from './finalRecoveryRules';

/** The facts, guidance and history of one case, its recovery firing and the action form. It owns the action draft. */
export function RecoveryDetail({
  value,
  lanes,
  disabled,
  onBindAllowanceSubject,
  onAppend,
}: {
  value: FinalRecoveryCaseDto;
  lanes: readonly DirectorLaneSnapshotDto[];
  disabled: boolean;
  onBindAllowanceSubject: FinalRecoveryCommands['bindAllowanceSubject'];
  onAppend: FinalRecoveryCommands['appendEntry'];
}) {
  const options = availableEntryTypes(value.status);
  const [type, setType] = useEntryTypeSelection(options, 'NOTE');
  const [statement, setStatement] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [ruleReference, setRuleReference] = useState(value.guidance.ruleReferences[0] ?? '');
  const [classification, setClassification] = useState(value.guidance.classifications[0] ?? 'OTHER');
  const [remedy, setRemedy] = useState(value.guidance.remedies[0] ?? 'OTHER');
  const [remainingTimeSeconds, setRemainingTimeSeconds] = useState('');
  const [grantedTimeSeconds, setGrantedTimeSeconds] = useState('');
  const [shotCount, setShotCount] = useState('');
  const [subjectKey, setSubjectKey] = useState('');

  const bindIdentity = () =>
    onBindAllowanceSubject({
      caseId: value.id,
      subject: {
        kind: allowanceSubjectKind(value.procedureProfile),
        key: subjectKey,
        description: `Official reference: ${subjectKey}`,
      },
      officialName,
      statement,
    });

  const append = () =>
    onAppend(
      {
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
      },
      () => {
        setStatement('');
        setRemainingTimeSeconds('');
        setGrantedTimeSeconds('');
        setShotCount('');
      },
    );

  return (
    <div className="space-y-4 rounded-[3px] border border-vscode-border p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-vscode-text">{sentenceCaseLabel(value.incidentType)}</h3>
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

      <FinalRecoveryFiringPanel key={value.id} value={value} disabled={disabled} />

      {value.incidentType === 'MALFUNCTION' && (
        <p className="text-xs text-vscode-text-muted">
          {value.allowanceSubject
            ? `Allowance identity: ${value.allowanceSubject.kind} · ${value.allowanceSubject.description} (${value.allowanceSubject.key})`
            : 'No allowance identity captured. Confirm the original athlete or team reference below; notes and rulings remain available.'}
        </p>
      )}
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
              <span className="font-medium text-vscode-text">{sentenceCaseLabel(entry.type)}</span>
              {entry.classification ? ` · ${sentenceCaseLabel(entry.classification)}` : ''}
              {entry.remedy ? ` · ${sentenceCaseLabel(entry.remedy)}` : ''}
              {' · '}
              {entry.statement} · {entry.officialName}
            </div>
          ))}
        </div>
      </section>

      {value.status !== 'VOID' && options.length > 0 && (
        <section className="space-y-2">
          <div className="grid gap-2 md:grid-cols-2">
            <label className={mutedLabelClass}>
              Action
              <select
                value={type}
                onChange={(event) => setType(event.target.value as typeof type)}
                className={blockInputClass}
              >
                {options.map((entryType) => (
                  <option key={entryType} value={entryType}>
                    {sentenceCaseLabel(entryType)}
                  </option>
                ))}
              </select>
            </label>
            <label className={mutedLabelClass}>
              Official
              <input
                value={officialName}
                onChange={(event) => setOfficialName(event.target.value)}
                className={blockInputClass}
              />
            </label>
            {type === 'JURY_RULING' && (
              <label className={mutedLabelClass}>
                Classification
                <select
                  value={classification}
                  onChange={(event) => setClassification(event.target.value as typeof classification)}
                  className={blockInputClass}
                >
                  {value.guidance.classifications.map((item) => (
                    <option key={item} value={item}>
                      {sentenceCaseLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {type === 'REMEDY_AUTHORIZED' && (
              <label className={mutedLabelClass}>
                Authorized remedy
                <select
                  value={remedy}
                  onChange={(event) => setRemedy(event.target.value as typeof remedy)}
                  className={blockInputClass}
                >
                  {value.guidance.remedies.map((item) => (
                    <option key={item} value={item}>
                      {sentenceCaseLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={mutedLabelClass}>
              Statement
              <input
                value={statement}
                onChange={(event) => setStatement(event.target.value)}
                className={blockInputClass}
              />
            </label>
            <label className={mutedLabelClass}>
              Rule reference
              <input
                value={ruleReference}
                onChange={(event) => setRuleReference(event.target.value)}
                className={blockInputClass}
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
          {!value.allowanceSubject && value.incidentType === 'MALFUNCTION' && (
            <div className="space-y-2 border-t border-vscode-border pt-3">
              <label className={mutedLabelClass}>
                Original athlete or team reference
                <input
                  value={subjectKey}
                  onChange={(event) => setSubjectKey(event.target.value)}
                  className={blockInputClass}
                />
              </label>
              <p className="text-[11px] text-vscode-text-muted">
                Use the same identity as related cases. The official and statement above attest this permanent
                association.
              </p>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || !subjectKey.trim() || !officialName.trim() || !statement.trim()}
                onClick={() => void bindIdentity()}
              >
                Confirm allowance identity
              </Button>
            </div>
          )}
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
    <label className={mutedLabelClass}>
      {label}
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={blockInputClass}
      />
    </label>
  );
}

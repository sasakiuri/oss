import { useEffect, useState } from 'react';

import { sentenceCaseLabel } from '@/renderer/presentation/formatters/enumLabel';
import type {
  AppendQualificationMalfunctionEntryPayload,
  QualificationMalfunctionCaseDto,
} from '@/shared/ipc/contracts';

import { useEntryTypeSelection } from '../shared/cases/useEntryTypeSelection';
import { Button } from '../shared/common/Button';
import { paddedInputClass, stackedMediumLabelClass } from '../shared/common/formClasses';

import { Fact, NumberField } from './MalfunctionFields';
import { availableEntryTypes, requiredRemedy } from './malfunctionRules';

const OFFICIAL_ROLES = ['RANGE_OFFICER', 'CRO', 'JURY_MEMBER', 'RTS_OFFICER', 'TECHNICAL_OFFICER'] as const;

/** The form that appends an official entry to a case. It owns its draft. */
export function MalfunctionEntryForm({
  value,
  disabled,
  onAppend,
}: {
  value: QualificationMalfunctionCaseDto;
  disabled: boolean;
  /** Appends the entry; `onSaved` runs once the case shows it. */
  onAppend: (payload: AppendQualificationMalfunctionEntryPayload, onSaved: () => void) => Promise<boolean>;
}) {
  const entryTypes = availableEntryTypes(value);
  const [type, setType] = useEntryTypeSelection(entryTypes, 'NOTE');
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
    if (!causes.some((cause) => cause.code === causeCode)) setCauseCode(causes[0]?.code ?? '');
  }, [causeCode, causes]);

  useEffect(() => {
    if (type === 'SCORE_SETTLED') setOfficialRole('RTS_OFFICER');
    else if (type === 'REPAIR_EXTENDED') setOfficialRole('JURY_MEMBER');
  }, [type]);

  const submit = () =>
    onAppend(
      {
        caseId: value.id,
        type,
        statement,
        officialName,
        officialRole,
        ...(type === 'CLASSIFIED' ? { classification, causeCode } : {}),
        ...(type === 'REMEDY_AUTHORIZED' && remedy ? { remedy: remedy.remedy, shotsToFire: remedy.shotsToFire } : {}),
        ...(type === 'REPAIR_EXTENDED' ? { repairSeconds: Number(repairSeconds) } : {}),
        ...(type === 'EXECUTION_RECORDED' || type === 'SCORE_SETTLED' ? { artifactId } : {}),
      },
      () => {
        setStatement('');
        setArtifactId('');
        setRepairSeconds('');
      },
    );

  const conditionalValid =
    (type !== 'CLASSIFIED' || Boolean(causeCode)) &&
    (type !== 'REMEDY_AUTHORIZED' || remedy !== null) &&
    (type !== 'REPAIR_EXTENDED' || (Number.isInteger(Number(repairSeconds)) && Number(repairSeconds) > 0)) &&
    (type !== 'EXECUTION_RECORDED' && type !== 'SCORE_SETTLED' ? true : Boolean(artifactId.trim()));

  return (
    <div className="border-t border-vscode-border pt-3">
      <p className="text-xs font-semibold text-vscode-text">Append an official entry</p>
      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <label className={stackedMediumLabelClass}>
          Entry type
          <select
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
            className={paddedInputClass}
          >
            {entryTypes.map((candidate) => (
              <option key={candidate} value={candidate}>
                {sentenceCaseLabel(candidate)}
              </option>
            ))}
          </select>
        </label>
        <label className={stackedMediumLabelClass}>
          Official role
          <select
            value={officialRole}
            onChange={(event) => setOfficialRole(event.target.value as typeof officialRole)}
            className={paddedInputClass}
          >
            {OFFICIAL_ROLES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {sentenceCaseLabel(candidate)}
              </option>
            ))}
          </select>
        </label>
        <label className={stackedMediumLabelClass}>
          Official name
          <input
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={paddedInputClass}
          />
        </label>
        <label className={stackedMediumLabelClass}>
          Statement
          <input
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            className={paddedInputClass}
          />
        </label>

        {type === 'CLASSIFIED' && (
          <>
            <label className={stackedMediumLabelClass}>
              Official classification
              <select
                value={classification}
                onChange={(event) => setClassification(event.target.value as typeof classification)}
                className={paddedInputClass}
              >
                <option value="ALLOWABLE">Allowable</option>
                <option value="NON_ALLOWABLE">Non-allowable</option>
              </select>
            </label>
            <label className={`${stackedMediumLabelClass} md:col-span-2`}>
              Inspected cause
              <select
                value={causeCode}
                onChange={(event) => setCauseCode(event.target.value)}
                className={paddedInputClass}
              >
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
            <Fact
              label="Rule-required remedy"
              value={`${sentenceCaseLabel(remedy.remedy)} · ${remedy.shotsToFire} shots`}
            />
          </div>
        )}
        {type === 'REPAIR_EXTENDED' && (
          <NumberField label="Extension seconds" value={repairSeconds} onChange={setRepairSeconds} minimum={1} />
        )}
        {(type === 'EXECUTION_RECORDED' || type === 'SCORE_SETTLED') && (
          <label className={`${stackedMediumLabelClass} md:col-span-2`}>
            Saved evidence reference
            <input
              value={artifactId}
              onChange={(event) => setArtifactId(event.target.value)}
              className={paddedInputClass}
            />
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

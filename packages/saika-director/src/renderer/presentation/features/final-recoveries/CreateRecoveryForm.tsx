import { useEffect, useState } from 'react';

import { sentenceCaseLabel } from '@/renderer/presentation/formatters/enumLabel';
import type {
  DirectorLaneSnapshotDto,
  FinalOperationRunDto,
  FinalRecoveryIncidentTypeDto,
  FinalRecoveryPhaseDto,
  FinalRecoveryProcedureProfileDto,
} from '@/shared/ipc/contracts';
import type { CompetitionPhase } from '@sasakiuri/saika-protocol/CompetitionState';

import { Button } from '../shared/common/Button';
import { blockInputClass, mutedLabelClass } from '../shared/common/formClasses';
import { toggleSetMember } from '../shared/common/toggleSetMember';
import { laneLabel } from '../shared/lanes/laneLabels';

import type { FinalRecoveryCommands } from './finalRecoveryCommands';
import { getFinalRecoveryDefaults } from './finalRecoveryDefaults';
import { allowanceSubjectKind, recoveryFiringContext, requiresSingleLane } from './finalRecoveryRules';

/** The form that opens a Final recovery case. It owns its draft and applies the rule defaults of the Final. */
export function CreateRecoveryForm({
  competitionId,
  competitionTypeId,
  eventId,
  phase,
  lanes,
  run,
  disabled,
  onCreate,
}: {
  competitionId: string;
  competitionTypeId?: string;
  eventId?: string;
  phase: CompetitionPhase;
  lanes: readonly DirectorLaneSnapshotDto[];
  run: FinalOperationRunDto | null;
  disabled: boolean;
  onCreate: FinalRecoveryCommands['create'];
}) {
  const [affectedLaneIds, setAffectedLaneIds] = useState<Set<string>>(() => new Set());
  const { purpose, shotsPerParticipant } = recoveryFiringContext(lanes, affectedLaneIds, competitionId, run);
  const defaults = getFinalRecoveryDefaults(competitionTypeId, phase, { purpose, shotsPerParticipant });
  const [procedureProfile, setProcedureProfile] = useState<FinalRecoveryProcedureProfileDto>(
    () => defaults.procedureProfile,
  );
  const [incidentType, setIncidentType] = useState<FinalRecoveryIncidentTypeDto>('MALFUNCTION');
  const [recoveryPhase, setRecoveryPhase] = useState<FinalRecoveryPhaseDto>(() => defaults.phase);
  const [summary, setSummary] = useState('');
  const [allowanceIdentity, setAllowanceIdentity] = useState('');
  const [officialName, setOfficialName] = useState('');
  const singleLaneRequired = requiresSingleLane(procedureProfile, incidentType);

  useEffect(() => {
    const next = getFinalRecoveryDefaults(competitionTypeId, phase, { purpose, shotsPerParticipant });
    setProcedureProfile(next.procedureProfile);
    setRecoveryPhase(next.phase);
  }, [competitionTypeId, phase, purpose, shotsPerParticipant]);

  const submit = () => {
    const currentStep = run?.currentStep?.step;
    return onCreate(
      {
        competitionId,
        ...(eventId ? { eventId } : {}),
        ...(run ? { finalRunId: run.id } : {}),
        ...(currentStep
          ? { scriptStepId: currentStep.id, scriptStepSnapshot: `${currentStep.actor}: ${currentStep.text}` }
          : {}),
        ...(allowanceIdentity.trim()
          ? {
              allowanceSubject: {
                kind: allowanceSubjectKind(procedureProfile),
                key: allowanceIdentity.trim(),
                description: `Official reference: ${allowanceIdentity.trim()}`,
              },
            }
          : {}),
        procedureProfile,
        incidentType,
        phase: recoveryPhase,
        affectedLaneIds: [...affectedLaneIds],
        summary,
        openedBy: officialName,
      },
      () => {
        setSummary('');
        setAffectedLaneIds(new Set());
      },
    );
  };

  return (
    <div className="rounded-[3px] border border-vscode-border p-3">
      <p className="text-xs font-semibold text-vscode-text">Open a recovery record</p>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <label className={mutedLabelClass}>
          Procedure profile
          <select
            value={procedureProfile}
            onChange={(event) => setProcedureProfile(event.target.value as typeof procedureProfile)}
            className={blockInputClass}
          >
            {PROFILES.map((value) => (
              <option key={value} value={value}>
                {sentenceCaseLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className={mutedLabelClass}>
          Incident
          <select
            value={incidentType}
            onChange={(event) => setIncidentType(event.target.value as typeof incidentType)}
            className={blockInputClass}
          >
            {INCIDENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {sentenceCaseLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className={mutedLabelClass}>
          Final phase
          <select
            value={recoveryPhase}
            onChange={(event) => setRecoveryPhase(event.target.value as typeof recoveryPhase)}
            className={blockInputClass}
          >
            {RECOVERY_PHASES.map((value) => (
              <option key={value} value={value}>
                {sentenceCaseLabel(value)}
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
                    : toggleSetMember(current, lane.laneId, event.target.checked),
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
        <label className={mutedLabelClass}>
          Observed facts
          <input value={summary} onChange={(event) => setSummary(event.target.value)} className={blockInputClass} />
        </label>
        <label className={mutedLabelClass}>
          Opening official
          <input
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={blockInputClass}
          />
        </label>
      </div>
      {incidentType === 'MALFUNCTION' && (
        <label className={`${mutedLabelClass} mt-3`}>
          Athlete or team reference for manual operation
          <input
            value={allowanceIdentity}
            onChange={(event) => setAllowanceIdentity(event.target.value)}
            className={blockInputClass}
          />
          <span className="text-[11px] text-vscode-text-muted">
            Assigned athlete/team identity is used when available. Otherwise enter a stable reference; use the same team
            reference for both teammates and retain it after changing firing points.
          </span>
        </label>
      )}
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

import type {
  DirectorLaneSnapshotDto,
  FinalOperationRunDto,
  FinalRecoveryCaseDto,
  FinalRecoveryEntryTypeDto,
  FinalRecoveryIncidentTypeDto,
  FinalRecoveryProcedureProfileDto,
} from '@/shared/ipc/contracts';

/** The actions an official may record on a case in its current status; none once it is void. */
export function availableEntryTypes(status: FinalRecoveryCaseDto['status']): FinalRecoveryEntryTypeDto[] {
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

/** A 25m Final malfunction claim is tracked for exactly one finalist and Lane. */
export function requiresSingleLane(
  profile: FinalRecoveryProcedureProfileDto,
  incidentType: FinalRecoveryIncidentTypeDto,
): boolean {
  return incidentType === 'MALFUNCTION' && (profile === 'PISTOL_25M_RAPID_FIRE' || profile === 'PISTOL_25M_WOMEN');
}

/** A Mixed Team Final counts the malfunction allowance per team, every other Final per athlete. */
export function allowanceSubjectKind(profile: FinalRecoveryProcedureProfileDto): 'TEAM' | 'ATHLETE' {
  return profile === 'RIFLE_PISTOL_10M_50M_MIXED_TEAM' ? 'TEAM' : 'ATHLETE';
}

/**
 * What the profile and phase defaults depend on: the firing purpose of the current Final step and the shot capacity of
 * the current series, when every affected Lane (or every Lane, while none is chosen) of the competition shares it.
 */
export function recoveryFiringContext(
  lanes: readonly DirectorLaneSnapshotDto[],
  affectedLaneIds: ReadonlySet<string>,
  competitionId: string,
  run: FinalOperationRunDto | null,
) {
  const relevantStates = lanes
    .filter((lane) => affectedLaneIds.size === 0 || affectedLaneIds.has(lane.laneId))
    .map((lane) => lane.competitionState)
    .filter((state) => state?.competitionId === competitionId);
  const shotLimits = new Set(relevantStates.map((state) => state!.currentSeries.maxShots));
  const effect = run?.currentStep?.step.effect;
  const purpose = effect && 'purpose' in effect ? effect.purpose : undefined;
  const shotsPerParticipant = shotLimits.size === 1 ? [...shotLimits][0] : undefined;
  return { purpose, shotsPerParticipant };
}

/** The numeric limits of the rule guidance as one line. */
export function formatLimits(limits: FinalRecoveryCaseDto['guidance']['limits']): string {
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

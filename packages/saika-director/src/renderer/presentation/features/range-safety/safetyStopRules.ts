import type { ClearSafetyStopPayload, DirectorLaneSnapshotDto, SafetyStopAuditEntryDto } from '@/shared/ipc/contracts';

export type FirearmCondition = SafetyStopAuditEntryDto['laneClearances'][number]['firearmCondition'];

/** The physical verification an official enters for one stopped Lane. */
export interface LaneClearanceDraft {
  selected: boolean;
  athleteConfirmationStatus: 'PENDING' | 'CONFIRMED' | 'NOT_APPLICABLE';
  athleteNotApplicableReason: string;
  personnelClear: boolean;
  firearmCondition: FirearmCondition;
  verificationNote: string;
}

export const DEFAULT_CLEARANCE_DRAFT: LaneClearanceDraft = {
  selected: false,
  athleteConfirmationStatus: 'PENDING',
  athleteNotApplicableReason: '',
  personnelClear: false,
  firearmCondition: 'UNLOADED_SAFETY_FLAG_INSERTED',
  verificationNote: '',
};

/** The stopped Lanes grouped by safety STOP, in Lane order. */
export function stoppedLaneGroups(
  lanes: readonly DirectorLaneSnapshotDto[],
): Array<[safetyStopId: string, lanes: DirectorLaneSnapshotDto[]]> {
  const groups = new Map<string, DirectorLaneSnapshotDto[]>();
  for (const lane of lanes) {
    const state = lane.safetyState;
    if (state?.status !== 'STOPPED' || !state.safetyStopId) continue;
    const group = groups.get(state.safetyStopId) ?? [];
    group.push(lane);
    groups.set(state.safetyStopId, group);
  }
  return [...groups.entries()];
}

/** A Lane is ready for clearance once it is selected, its personnel are clear and its athlete check is settled. */
export function laneClearanceReady(lane: DirectorLaneSnapshotDto, draft: LaneClearanceDraft | undefined): boolean {
  if (!draft?.selected || !draft.personnelClear) return false;
  if (!lane.assignment?.athlete) return true;
  return (
    draft.athleteConfirmationStatus === 'CONFIRMED' ||
    (draft.athleteConfirmationStatus === 'NOT_APPLICABLE' && Boolean(draft.athleteNotApplicableReason.trim()))
  );
}

/** The clearance record of a verified Lane, with the athlete snapshot assigned at verification. */
export function laneClearance(
  lane: DirectorLaneSnapshotDto,
  draft: LaneClearanceDraft,
  verifiedBy: string,
): ClearSafetyStopPayload['laneClearances'][number] {
  const athlete = lane.assignment?.athlete ?? null;
  return {
    laneId: lane.laneId,
    participantId: athlete?.id ?? null,
    participantName: athlete?.name ?? null,
    athleteConfirmation: athlete
      ? draft.athleteConfirmationStatus === 'CONFIRMED'
        ? { status: 'CONFIRMED' as const, confirmedBy: athlete.name }
        : {
            status: 'NOT_APPLICABLE' as const,
            reason: draft.athleteNotApplicableReason.trim(),
          }
      : { status: 'NOT_APPLICABLE' as const, reason: 'No athlete assigned at verification' },
    firearmCondition: draft.firearmCondition,
    personnelClear: true as const,
    verifiedBy,
    ...(draft.verificationNote.trim() ? { verificationNote: draft.verificationNote.trim() } : {}),
  };
}

/** `Firing point <n>`, else the Lane alias, else `Lane` and the first eight characters of the Lane id. */
export function clearanceLaneLabel(lane: DirectorLaneSnapshotDto): string {
  return lane.firingPointNumber
    ? `Firing point ${lane.firingPointNumber}`
    : lane.laneAlias || `Lane ${lane.laneId.slice(0, 8)}`;
}

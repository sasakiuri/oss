import type { ClearSafetyStopPayload } from '@/shared/ipc/contracts';

interface SafetyClearanceSnapshot {
  readonly lanes: ReadonlyArray<{
    readonly laneId: string;
    readonly safetyState: { readonly status: 'STOPPED' | 'CLEAR'; readonly safetyStopId: string | null } | null;
    readonly assignment: { readonly athlete: { readonly id: string; readonly name: string } | null } | null;
  }>;
}

/** Validates Director-only physical checks before any Lane safety latch is cleared. */
export class SafetyStopClearancePolicy {
  validate(request: ClearSafetyStopPayload, snapshot: SafetyClearanceSnapshot): void {
    for (const clearance of request.laneClearances) {
      const lane = snapshot.lanes.find((candidate) => candidate.laneId === clearance.laneId);
      if (!lane) throw new Error(`Safety clearance Lane ${clearance.laneId} is not known to Director`);
      if (lane.safetyState?.status !== 'STOPPED' || lane.safetyState.safetyStopId !== request.safetyStopId) {
        throw new Error(`Lane ${clearance.laneId} is not stopped by safety operation ${request.safetyStopId}`);
      }

      const athlete = lane.assignment?.athlete ?? null;
      if (athlete) {
        if (clearance.participantId !== athlete.id || clearance.participantName !== athlete.name) {
          throw new Error(`Lane ${clearance.laneId} athlete assignment changed before safety clearance`);
        }
        if (
          clearance.athleteConfirmation.status === 'CONFIRMED' &&
          clearance.athleteConfirmation.confirmedBy !== athlete.name
        ) {
          throw new Error(`Lane ${clearance.laneId} athlete confirmation does not match ${athlete.name}`);
        }
      } else {
        if (clearance.participantId !== null || clearance.participantName !== null) {
          throw new Error(`Lane ${clearance.laneId} has no assigned athlete to confirm`);
        }
        if (clearance.athleteConfirmation.status !== 'NOT_APPLICABLE') {
          throw new Error(`Lane ${clearance.laneId} must explain why athlete confirmation is not applicable`);
        }
      }
    }
  }
}

export const SAFETY_STOP_CLEARANCE_RULE_REFERENCES = [
  'ISSF 6.2.1.3',
  'ISSF 6.2.2.2',
  'ISSF 6.2.2.4',
  'ISSF 6.2.2.7',
  'ISSF 6.2.3.6',
] as const;

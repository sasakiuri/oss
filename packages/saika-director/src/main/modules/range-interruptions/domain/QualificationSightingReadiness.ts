// SPDX-License-Identifier: MIT
import type { QualificationRecoveryExecutionRecord } from './QualificationRecoveryExecution';
import type { QualificationTimedTargetRecoveryDecision } from './QualificationTimedTargetRecoveryDecision';

/** Checks evidence of an authorized prerequisite; never issues a firing command. */
export function requireQualificationSighting(
  decision: QualificationTimedTargetRecoveryDecision,
  executions: readonly QualificationRecoveryExecutionRecord[],
  now: Date,
): { runId: string; minimumPauseSeconds: number } | undefined {
  const pause = decision.authorizedRecovery.minimumPauseAfterSightingSeconds;
  if (pause === undefined || decision.authorizedRecovery.extraSightingSeriesShots === 0) return undefined;
  const sighting = executions.find(
    (run) =>
      run.decisionId === decision.id &&
      run.phase === 'EXTRA_SIGHTING' &&
      run.status === 'COMPLETED' &&
      run.authorization.phase === 'EXTRA_SIGHTING' &&
      run.authorization.shotsToFire === decision.authorizedRecovery.extraSightingSeriesShots,
  );
  const terminalAt = Date.parse(sighting?.latestLaneState?.terminalAt ?? '');
  if (!sighting || !Number.isFinite(terminalAt)) {
    throw new Error('Complete the authorized extra sighting series before continuing');
  }
  const readyAt = terminalAt + pause * 1000;
  if (!Number.isFinite(now.getTime()) || now.getTime() < readyAt) {
    throw new Error(`The pause after sighting ends at ${new Date(readyAt).toISOString()}`);
  }
  return { runId: sighting.runId, minimumPauseSeconds: pause };
}

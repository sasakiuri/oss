import type { RuleCommandScriptStep } from '@sasakiuri/saika-rules';

/** Derives the immutable number of observations required from each Lane. */
export function inferShootOffShotsPerLane(script: readonly RuleCommandScriptStep[]): number {
  const counts = script.flatMap((step) => {
    const effect = step.effect;
    return (effect.type === 'OPEN_FIRING' || effect.type === 'RUN_TIMED_TARGET') && effect.purpose === 'SHOOT_OFF'
      ? [effect.shotsPerParticipant]
      : [];
  });
  if (counts.length !== 1 || counts[0] === undefined || !Number.isInteger(counts[0]) || counts[0] <= 0) {
    throw new Error('A Final shoot-off script requires exactly one firing window with a positive shot count');
  }
  return counts[0];
}

/** Reads newer persisted metadata and safely infers the value for older runs. */
export function shootOffShotsPerLaneFromMetadata(
  metadata: Readonly<Record<string, unknown>> | null,
  script: readonly RuleCommandScriptStep[],
): number {
  const stored = metadata?.shotsPerLane;
  if (stored === undefined) return inferShootOffShotsPerLane(script);
  if (!Number.isInteger(stored) || (stored as number) <= 0) {
    throw new Error('Stored shoot-off shot count is invalid');
  }
  return stored as number;
}

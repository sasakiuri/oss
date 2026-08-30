export interface FinalOperationShootOffUnit {
  readonly unitId: string;
  readonly label: string;
  readonly laneIds: readonly string[];
}

/**
 * Creates an immutable scoring-unit snapshot for a shoot-off round.
 *
 * A unit is deliberately generic: it is one Lane for an individual Final and
 * two Lanes for an ISSF Mixed Team Final. This keeps the Final runner
 * independent from participant and team repositories.
 */
export function normalizeShootOffUnits(
  eligibleLaneIds: readonly string[],
  proposedUnits?: readonly FinalOperationShootOffUnit[],
  requiredLanesPerUnit?: number,
): FinalOperationShootOffUnit[] {
  const uniqueEligibleLaneIds = [...new Set(eligibleLaneIds)];
  if (uniqueEligibleLaneIds.length !== eligibleLaneIds.length) {
    throw new Error('Shoot-off eligible Lane IDs must be unique');
  }

  const units = proposedUnits
    ? proposedUnits.map((unit) => ({
        unitId: unit.unitId.trim(),
        label: unit.label.trim(),
        laneIds: [...unit.laneIds],
      }))
    : uniqueEligibleLaneIds.map((laneId) => ({ unitId: laneId, label: laneId, laneIds: [laneId] }));

  if (units.length < 2) throw new Error('A shoot-off requires at least two scoring units');
  if (units.some((unit) => !unit.unitId || !unit.label || unit.laneIds.length === 0)) {
    throw new Error('Every shoot-off scoring unit requires an ID, label, and at least one Lane');
  }
  if (new Set(units.map((unit) => unit.unitId)).size !== units.length) {
    throw new Error('Shoot-off scoring unit IDs must be unique');
  }
  if (requiredLanesPerUnit !== undefined && units.some((unit) => unit.laneIds.length !== requiredLanesPerUnit)) {
    throw new Error(`Every shoot-off scoring unit requires exactly ${requiredLanesPerUnit} Lanes`);
  }

  const unitLaneIds = units.flatMap((unit) => unit.laneIds);
  if (new Set(unitLaneIds).size !== unitLaneIds.length) {
    throw new Error('A Lane may belong to only one shoot-off scoring unit');
  }
  if (
    unitLaneIds.length !== uniqueEligibleLaneIds.length ||
    unitLaneIds.some((laneId) => !uniqueEligibleLaneIds.includes(laneId))
  ) {
    throw new Error('Shoot-off scoring units must cover every eligible Lane exactly once');
  }

  return units;
}

/** Reads the persisted snapshot, while retaining compatibility with older individual rounds. */
export function shootOffUnitsFromMetadata(
  eligibleLaneIds: readonly string[],
  metadata: Readonly<Record<string, unknown>> | null,
): FinalOperationShootOffUnit[] {
  const value = metadata?.units;
  if (value === undefined) return normalizeShootOffUnits(eligibleLaneIds);
  if (!Array.isArray(value)) throw new Error('Stored shoot-off scoring units are invalid');

  const units = value.map((candidate): FinalOperationShootOffUnit => {
    if (!isRecord(candidate)) throw new Error('Stored shoot-off scoring unit is invalid');
    const laneIds = candidate.laneIds;
    if (
      typeof candidate.unitId !== 'string' ||
      typeof candidate.label !== 'string' ||
      !Array.isArray(laneIds) ||
      laneIds.some((laneId) => typeof laneId !== 'string')
    ) {
      throw new Error('Stored shoot-off scoring unit is invalid');
    }
    return { unitId: candidate.unitId, label: candidate.label, laneIds: laneIds as string[] };
  });
  return normalizeShootOffUnits(eligibleLaneIds, units);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

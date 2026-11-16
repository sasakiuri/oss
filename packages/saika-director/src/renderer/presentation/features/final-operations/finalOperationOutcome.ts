// SPDX-License-Identifier: MIT
import type { DirectorLaneSnapshotDto, FinalOperationRunDto } from '@/shared/ipc/contracts';

import { laneLabelById } from '../shared/lanes/laneLabels';

/** The outcome main recorded when it closed a shoot-off round, read from untyped entry metadata. */
export interface ShootOffOutcome {
  eliminatedUnitId: string | null;
  eliminatedUnitLabel: string | null;
  eliminatedLaneIds: string[];
  remainingTiedUnitIds: string[];
  eliminatedLaneId: string | null;
  remainingTiedLaneIds: string[];
  unitScores: Array<{ unitId: string; label: string; laneIds: string[]; scoreX10: number }>;
}

/**
 * The outcome of the latest closed shoot-off round, or null when no round was closed or the latest one has no
 * metadata. Older Lane-only metadata (`eliminatedLaneId`, `remainingTiedLaneIds`) fills the unit fields.
 */
export function readLatestShootOffOutcome(run: FinalOperationRunDto): ShootOffOutcome | null {
  const metadata = [...run.entries].reverse().find((entry) => entry.entryType === 'SHOOT_OFF_ROUND_CLOSED')?.metadata;
  if (!metadata) return null;
  const eliminatedLaneId = typeof metadata.eliminatedLaneId === 'string' ? metadata.eliminatedLaneId : null;
  const eliminatedLaneIds = readStringArray(metadata.eliminatedLaneIds);
  const remainingTiedLaneIds = Array.isArray(metadata.remainingTiedLaneIds)
    ? metadata.remainingTiedLaneIds.filter((laneId): laneId is string => typeof laneId === 'string')
    : [];
  const eliminatedUnitId = typeof metadata.eliminatedUnitId === 'string' ? metadata.eliminatedUnitId : eliminatedLaneId;
  const eliminatedUnitLabel = typeof metadata.eliminatedUnitLabel === 'string' ? metadata.eliminatedUnitLabel : null;
  const remainingTiedUnitIds = readStringArray(metadata.remainingTiedUnitIds);
  const unitScores = readShootOffUnitScores(metadata.unitScores);
  return {
    eliminatedUnitId,
    eliminatedUnitLabel,
    eliminatedLaneIds: eliminatedLaneIds.length > 0 ? eliminatedLaneIds : eliminatedLaneId ? [eliminatedLaneId] : [],
    remainingTiedUnitIds: remainingTiedUnitIds.length > 0 ? remainingTiedUnitIds : remainingTiedLaneIds,
    eliminatedLaneId,
    remainingTiedLaneIds,
    unitScores,
  };
}

/** The recorded label of the eliminated unit, else its unit score label, else the Lane label of the id. */
export function shootOffOutcomeUnitLabel(
  outcome: ShootOffOutcome,
  unitId: string,
  lanes: readonly DirectorLaneSnapshotDto[],
): string {
  if (outcome.eliminatedUnitId === unitId && outcome.eliminatedUnitLabel) return outcome.eliminatedUnitLabel;
  const score = outcome.unitScores.find((candidate) => candidate.unitId === unitId);
  if (score) return score.label;
  return laneLabelById(lanes, unitId);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readShootOffUnitScores(value: unknown): ShootOffOutcome['unitScores'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const laneIds = readStringArray(candidate.laneIds);
    if (
      typeof candidate.unitId !== 'string' ||
      typeof candidate.label !== 'string' ||
      typeof candidate.scoreX10 !== 'number' ||
      laneIds.length === 0
    ) {
      return [];
    }
    return [{ unitId: candidate.unitId, label: candidate.label, laneIds, scoreX10: candidate.scoreX10 }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

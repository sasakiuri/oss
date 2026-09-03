// SPDX-License-Identifier: MIT
import { fireEvent, render, screen } from '@testing-library/react';
import { ISSF_2026_P25 } from '@sasakiuri/saika-rules';
import { describe, expect, it, vi } from 'vitest';

import { TimedTargetControlPanel } from '@/renderer/presentation/features/competition-control/TimedTargetControlPanel';
import { competitionTypeFromRulePack } from '@/shared/competitionTypes';
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const SEQUENCE_ID = '44444444-4444-4444-8444-444444444444';
const AT = '2026-09-03T00:00:00.000Z';

function createLane(): DirectorLaneSnapshotDto {
  return {
    laneId: LANE_ID,
    laneAlias: 'Lane 1',
    firingPointNumber: 1,
    hardware: null,
    competitionState: {
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      sessionId: SESSION_ID,
      phase: 'MATCH',
      currentStage: { index: 1, name: 'Precision Stage', scored: true, totalSeries: 6 },
      currentSeries: { index: 0, shotsRecorded: 0, maxShots: 5 },
      awaitingSeriesStart: false,
      publishedAt: AT,
    },
    timedTargetState: {
      schemaVersion: 1,
      laneId: LANE_ID,
      sequenceId: SEQUENCE_ID,
      competitionId: COMPETITION_ID,
      programId: 'P25_MATCH_PRECISION_240',
      programLabel: 'Precision competition series',
      purpose: 'MATCH',
      stageIndex: 1,
      seriesIndex: 0,
      targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
      ruleReference: '6.4.13, 8.7.6.4(g)',
      phase: 'CANCELLED',
      signal: 'RED',
      shotWindowOpen: false,
      exposureIndex: null,
      exposureCount: 1,
      acceptedShotsInExposure: 0,
      loadAt: AT,
      attentionAt: AT,
      completesAt: AT,
      nextLoadAllowedAt: AT,
      nextTransitionAt: null,
      terminalReason: 'Range interruption',
      enforcementMode: 'REQUIRED',
      publishedAt: AT,
    },
    assignment: null,
    score: null,
    lastRawShot: null,
    lastCompetitionShot: null,
    lastSeenAt: AT,
  };
}

describe('TimedTargetControlPanel', () => {
  it('keeps match restart available after cancellation without coupling it to transient sighting telemetry', () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(
      <TimedTargetControlPanel
        definition={competitionTypeFromRulePack(ISSF_2026_P25)}
        phase="MATCH"
        lanes={[createLane()]}
        disabled={false}
        onStart={onStart}
        onCancel={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('button', { name: 'Run configured sighting series' })).toBeEnabled();
    const matchButton = screen.getByRole('button', { name: 'LOAD / run match series' });
    expect(matchButton).toBeEnabled();
    fireEvent.click(matchButton);

    expect(onStart).toHaveBeenCalledWith({
      programId: 'P25_MATCH_PRECISION_240',
      purpose: 'MATCH',
      stageIndex: 1,
      seriesIndex: 0,
    });
  });
});

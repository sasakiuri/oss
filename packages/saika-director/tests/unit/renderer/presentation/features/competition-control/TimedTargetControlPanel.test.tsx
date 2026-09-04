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

function createLane(hardware: DirectorLaneSnapshotDto['hardware'] = null): DirectorLaneSnapshotDto {
  return {
    laneId: LANE_ID,
    laneAlias: 'Lane 1',
    firingPointNumber: 1,
    hardware,
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

  it('requires external actuation verification when Lane reports no physical integration', () => {
    render(
      <TimedTargetControlPanel
        definition={competitionTypeFromRulePack(ISSF_2026_P25)}
        phase="MATCH"
        lanes={[
          createLane({
            laneId: LANE_ID,
            laneAlias: 'Lane 1',
            connection: { status: 'connected', manufacturer: 'SIUS', deviceId: 'HS25' },
            appVersion: '0.3.0',
            capabilities: {
              competitionProtocolVersions: [1],
              rulePacks: [],
              targetIntegration: {
                schemaVersion: 1,
                timedTarget: { actuation: 'NOT_INTEGRATED', feedback: 'NOT_INTEGRATED' },
              },
            },
            publishedAt: AT,
          }),
        ]}
        disabled={false}
        onStart={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText('HS25')).toBeInTheDocument();
    expect(screen.getByText('External actuation + verification')).toBeInTheDocument();
    expect(screen.getByText(/Operate and visually verify the external signal system/)).toHaveTextContent(
      'ISSF 8.7.6.3(h)',
    );
  });

  it('records an actual UNLOAD time while a required pause gates the next LOAD', () => {
    const lane = createLane();
    lane.timedTargetState = {
      schemaVersion: 1,
      sequenceId: SEQUENCE_ID,
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      programId: 'P25_SIGHTING_PRECISION_240',
      programLabel: 'Sighting',
      purpose: 'SIGHTING',
      stageIndex: 1,
      seriesIndex: 0,
      targetProfileId: 'precision',
      ruleReference: '8.7.6.4',
      phase: 'COMPLETE',
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
      terminalReason: null,
      enforcementMode: 'REQUIRED',
      publishedAt: AT,
      commandPause: {
        mode: 'REQUIRED',
        ruleReference: '8.7.6.4(d)',
        minimumSeconds: 60,
        unloadAt: null,
        officialName: null,
        nextLoadAllowedAt: null,
        blocked: true,
      },
    };
    const onRecord = vi.fn().mockResolvedValue(undefined);
    render(
      <TimedTargetControlPanel
        definition={competitionTypeFromRulePack(ISSF_2026_P25)}
        phase="MATCH"
        lanes={[lane]}
        disabled={false}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onRecordUnload={onRecord}
      />,
    );
    expect(screen.getByRole('button', { name: 'LOAD / run match series' })).toBeDisabled();
    const record = screen.getByRole('button', { name: 'Record UNLOAD (1 lanes)' });
    expect(record).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Official recording UNLOAD'), { target: { value: 'CRO' } });
    fireEvent.change(screen.getByLabelText('Actual UNLOAD time'), { target: { value: '2026-09-03T12:00:10.000' } });
    fireEvent.click(record);
    expect(onRecord).toHaveBeenCalledWith(
      SEQUENCE_ID,
      [LANE_ID],
      'CRO',
      new Date('2026-09-03T12:00:10.000').toISOString(),
    );
  });

  it('does not request external verification when actuation and feedback are both integrated', () => {
    const lane = createLane({
      laneId: LANE_ID,
      laneAlias: 'Lane 1',
      connection: { status: 'connected', deviceId: 'future-adapter' },
      appVersion: '1.0.0',
      capabilities: {
        competitionProtocolVersions: [1],
        rulePacks: [],
        targetIntegration: {
          schemaVersion: 1,
          timedTarget: { actuation: 'INTEGRATED', feedback: 'INTEGRATED' },
        },
      },
      publishedAt: AT,
    });

    render(
      <TimedTargetControlPanel
        definition={competitionTypeFromRulePack(ISSF_2026_P25)}
        phase="MATCH"
        lanes={[lane]}
        disabled={false}
        onStart={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText('Integrated + feedback')).toBeInTheDocument();
    expect(screen.queryByText(/Operate and visually verify the external signal system/)).not.toBeInTheDocument();
  });
});

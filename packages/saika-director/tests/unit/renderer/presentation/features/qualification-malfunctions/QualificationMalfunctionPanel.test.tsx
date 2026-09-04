import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ISSF_2026_RFPM } from '@sasakiuri/saika-rules';

import { QualificationMalfunctionPanel } from '@/renderer/presentation/features/qualification-malfunctions';
import type { DirectorLaneSnapshotDto, QualificationMalfunctionCaseDto } from '@/shared/ipc/contracts';

const { appendEntry, create, listByCompetition } = vi.hoisted(() => ({
  appendEntry: vi.fn(),
  create: vi.fn(),
  listByCompetition: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  qualificationMalfunctionsService: { appendEntry, create, listByCompetition },
}));

const competitionId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const participantId = '33333333-3333-4333-8333-333333333333';
const laneId = '44444444-4444-4444-8444-444444444444';
const sourceSignalId = '77777777-7777-4777-8777-777777777777';

describe('QualificationMalfunctionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByCompetition.mockResolvedValue({ success: true, data: [] });
    create.mockResolvedValue({ success: true, data: malfunctionCase() });
  });

  it('opens a manual case from an assigned Lane snapshot without issuing a Lane command', async () => {
    render(
      <QualificationMalfunctionPanel
        competitionId={competitionId}
        eventId={eventId}
        relayNumber={2}
        lanes={[laneSnapshot()]}
        supportsExceptionalMatchParts={false}
      />,
    );

    await waitFor(() => expect(listByCompetition).toHaveBeenCalledWith({ competitionId }));
    expect(screen.getByLabelText('Stage index')).toHaveValue(1);
    expect(screen.getByLabelText('Series index')).toHaveValue(3);
    expect(screen.getByLabelText('Shots already recorded')).toHaveValue(2);
    fireEvent.change(screen.getByLabelText('Observed facts'), { target: { value: 'Projectile lodged.' } });
    fireEvent.change(screen.getByLabelText('Opening official'), { target: { value: 'RO A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open malfunction case' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        competitionId,
        eventId,
        participantId,
        laneId,
        laneChannel: 7,
        relayNumber: 2,
        reportSource: 'DIRECTOR_MANUAL',
        claimMode: 'CLAIM',
        stageIndex: 1,
        seriesIndex: 3,
        recordedShots: 2,
        laneSessionId: '55555555-5555-4555-8555-555555555555',
        summary: 'Projectile lodged.',
        openedBy: 'RO A',
      }),
    );
    expect(await screen.findByText('FP 7 · Athlete A')).toBeInTheDocument();
    expect(appendEntry).not.toHaveBeenCalled();
  });

  it('requires an explicit official action and preserves a Lane declaration as immutable case context', async () => {
    create.mockResolvedValue({
      success: true,
      data: malfunctionCase({
        reportSource: 'LANE_SIGNAL',
        sourceSignalId,
        laneSnapshotCapturedAt: '2026-09-04T01:00:01.000Z',
      }),
    });
    render(
      <QualificationMalfunctionPanel
        competitionId={competitionId}
        eventId={eventId}
        relayNumber={2}
        lanes={[laneSnapshot(true)]}
        supportsExceptionalMatchParts={false}
      />,
    );

    await waitFor(() => expect(listByCompetition).toHaveBeenCalledWith({ competitionId }));
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use Lane declaration' }));

    expect(screen.getByLabelText('Athlete / firing point')).toBeDisabled();
    expect(screen.getByLabelText('Firing point')).toBeDisabled();
    expect(screen.getByLabelText('Stage index')).toBeDisabled();
    expect(screen.getByLabelText('Series index')).toBeDisabled();
    expect(screen.getByLabelText('Shots already recorded')).toBeDisabled();
    expect(screen.getByLabelText('Observed facts')).toHaveValue('Trigger did not release the shot.');
    fireEvent.change(screen.getByLabelText('Opening official'), { target: { value: 'RO A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open malfunction case' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        competitionId,
        eventId,
        participantId,
        laneId,
        laneChannel: 7,
        relayNumber: 2,
        reportSource: 'LANE_SIGNAL',
        sourceSignalId,
        claimMode: 'CLAIM',
        stageIndex: 1,
        seriesIndex: 3,
        recordedShots: 2,
        exposureIndex: 4,
        laneSessionId: '55555555-5555-4555-8555-555555555555',
        occurredAt: '2026-09-04T01:00:00.000Z',
        summary: 'Trigger did not release the shot.',
        openedBy: 'RO A',
      }),
    );
    expect(await screen.findByText('Official case already opened')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use Lane declaration' })).not.toBeInTheDocument();
    expect(appendEntry).not.toHaveBeenCalled();
  });
});

function laneSnapshot(withSignal = false): DirectorLaneSnapshotDto {
  return {
    laneId,
    laneAlias: 'Lane 7',
    firingPointNumber: 7,
    hardware: null,
    safetyState: null,
    rangeOfficerRequest: null,
    qualificationMalfunctionSignal: withSignal
      ? {
          schemaVersion: 1,
          laneId,
          status: 'ACTIVE',
          signalId: sourceSignalId,
          context: {
            competitionId,
            sessionId: '55555555-5555-4555-8555-555555555555',
            participantId,
            participantName: 'Athlete A',
            startNumber: '101',
            phase: 'MATCH',
            stageIndex: 1,
            seriesIndex: 3,
            seriesShotLimit: 5,
            recordedShots: 2,
            timedTargetProgramId: 'RFP_MATCH_8',
            exposureIndex: 4,
          },
          message: 'Trigger did not release the shot.',
          signalledAt: '2026-09-04T01:00:00.000Z',
          clearedAt: null,
          clearedBy: null,
          publishedAt: '2026-09-04T01:00:00.000Z',
        }
      : null,
    timedTargetState: null,
    qualificationRecoveryState: null,
    competitionState: {
      competitionId,
      laneId,
      sessionId: '55555555-5555-4555-8555-555555555555',
      phase: 'MATCH',
      currentStage: { index: 1, name: 'Stage 1', scored: true, totalSeries: 6 },
      currentSeries: { index: 3, shotsRecorded: 2, maxShots: 5 },
      publishedAt: '2026-09-04T01:00:00.000Z',
    },
    assignment: {
      competitionId,
      laneId,
      athlete: { id: participantId, startNumber: 101, name: 'Athlete A' },
      assignedAt: '2026-09-04T00:50:00.000Z',
      publishedAt: '2026-09-04T00:50:00.000Z',
    },
    score: null,
    lastRawShot: null,
    lastCompetitionShot: null,
    lastQualificationRecoveryShot: null,
    lastSeenAt: '2026-09-04T01:00:00.000Z',
  };
}

function malfunctionCase(overrides: Partial<QualificationMalfunctionCaseDto> = {}): QualificationMalfunctionCaseDto {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    competitionId,
    eventId,
    competitionTypeId: 'RFPM',
    rulePackIdentity: null,
    policySnapshot: structuredClone(
      ISSF_2026_RFPM.capabilities.qualificationMalfunction!,
    ) as QualificationMalfunctionCaseDto['policySnapshot'],
    participantId,
    participantNameSnapshot: 'Athlete A',
    startNumberSnapshot: '101',
    laneId,
    laneChannelSnapshot: 7,
    relayNumberSnapshot: 2,
    reportSource: 'DIRECTOR_MANUAL',
    sourceSignalId: null,
    claimMode: 'CLAIM',
    phase: 'MATCH',
    stageId: 'STAGE_1',
    stageIndex: 1,
    seriesIndex: 3,
    seriesShotLimit: 5,
    recordedShots: 2,
    timedTargetProgramId: 'RFP_MATCH_8',
    exposureIndex: null,
    laneSessionId: '55555555-5555-4555-8555-555555555555',
    laneSnapshotCapturedAt: null,
    exceptionalMatchPart: null,
    existingClaimsInScope: 0,
    existingClaimsInPart: null,
    claimAssessment: {
      allowed: true,
      maximumInScope: 1,
      maximumInExceptionalPart: null,
      reason: 'AVAILABLE',
    },
    summary: 'Projectile lodged.',
    openedBy: 'RO A',
    occurredAt: '2026-09-04T01:00:00.000Z',
    createdAt: '2026-09-04T01:00:00.000Z',
    status: 'OPEN',
    entries: [],
    ...overrides,
  };
}

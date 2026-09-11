import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RangeInterruptionsPanel } from '@/renderer/presentation/features/range-interruptions';
import type {
  QualificationRecoveryExecutionDto,
  QualificationRecoverySettlementDto,
  RangeInterruptionCaseDto,
} from '@/shared/ipc/contracts';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const INTERRUPTION_ID = '33333333-3333-4333-8333-333333333333';
const LANE_ID = '44444444-4444-4444-8444-444444444444';
const DECISION_ID = '55555555-5555-4555-8555-555555555555';
const RUN_ID = '66666666-6666-4666-8666-666666666666';

const {
  listAll,
  listByScope,
  create,
  linkScope,
  appendEntry,
  recordTargetRecovery,
  recordQualificationTimedTargetRecoveryDecision,
  startQualificationRecoveryExecution,
  cancelQualificationRecoveryExecution,
  adjudicateQualificationRecoveryExecution,
  applyQualificationRecoverySettlement,
  pauseLaneTimer,
  resumeLaneTimer,
  resumeLaneMatch,
} = vi.hoisted(() => ({
  listAll: vi.fn(),
  listByScope: vi.fn(),
  create: vi.fn(),
  linkScope: vi.fn(),
  appendEntry: vi.fn(),
  recordTargetRecovery: vi.fn(),
  recordQualificationTimedTargetRecoveryDecision: vi.fn(),
  startQualificationRecoveryExecution: vi.fn(),
  cancelQualificationRecoveryExecution: vi.fn(),
  adjudicateQualificationRecoveryExecution: vi.fn(),
  applyQualificationRecoverySettlement: vi.fn(),
  pauseLaneTimer: vi.fn(),
  resumeLaneTimer: vi.fn(),
  resumeLaneMatch: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  rangeInterruptionsService: {
    listAll,
    listByScope,
    create,
    linkScope,
    appendEntry,
    recordTargetRecovery,
    recordQualificationTimedTargetRecoveryDecision,
    startQualificationRecoveryExecution,
    cancelQualificationRecoveryExecution,
    adjudicateQualificationRecoveryExecution,
    applyQualificationRecoverySettlement,
  },
  mqttService: { pauseLaneTimer, resumeLaneTimer, resumeLaneMatch },
}));

function qualificationFixture(executionStatus?: QualificationRecoveryExecutionDto['status']): RangeInterruptionCaseDto {
  const seriesRecovery = {
    treatment: 'COMPLETE_REMAINING_SHOTS' as const,
    shotsToFire: 3,
    execution: { mode: 'SECONDS_PER_SHOT' as const, secondsPerShot: 48, totalSeconds: 144 },
  };
  const recommendation = {
    type: 'QUALIFICATION_TIMED_TARGET' as const,
    interruptionSeconds: 901,
    stageId: 'PRECISION_STAGE',
    extraSighting: { required: true, shots: 5 },
    seriesRecovery,
    ruleReferences: ['8.8.1(a)', '8.8.1(c-d)'],
    explanation: 'Complete the three remaining shots.',
  };
  const decision = {
    id: DECISION_ID,
    caseId: INTERRUPTION_ID,
    supersedesDecisionId: null,
    recommendation,
    authorizedRecovery: { extraSightingSeriesShots: 5, seriesRecovery },
    followsRecommendation: true,
    statement: 'The Jury authorizes the recommended recovery.',
    officialName: 'Jury Member A',
    incidentReportReference: 'RIR-25M-001',
    ruleReference: '8.8.1(a); 8.8.1(c-d)',
    decidedAt: '2026-08-31T01:15:05.000Z',
    recordedAt: '2026-08-31T01:15:05.000Z',
  };
  const execution: QualificationRecoveryExecutionDto | null = executionStatus
    ? {
        runId: RUN_ID,
        caseId: INTERRUPTION_ID,
        decisionId: DECISION_ID,
        competitionId: COMPETITION_ID,
        laneId: LANE_ID,
        phase: 'SERIES_RECOVERY',
        stageIndex: 1,
        seriesIndex: 0,
        expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
        expectedSeriesShotLimit: 5,
        expectedRecordedShots: 2,
        authorization: { phase: 'SERIES_RECOVERY', seriesRecovery },
        officialName: 'Jury Member A',
        decisionRuleReference: '8.8.1(a); 8.8.1(c-d)',
        decidedAt: '2026-08-31T01:15:05.000Z',
        requestedAt: '2026-08-31T01:16:00.000Z',
        status: executionStatus,
        latestLaneState: null,
        shots: [],
        events: [],
      }
    : null;
  return fixture({
    status: 'ENDED',
    qualificationTimedTargetContext: {
      competitionTypeId: 'P25',
      rulePack: {
        id: 'ISSF:2026:P25:QUALIFICATION',
        schemaVersion: 1,
        fingerprintSha256: 'a'.repeat(64),
      },
      stageId: 'PRECISION_STAGE',
      stageIndex: 1,
      seriesIndex: 0,
      timedTargetProgramId: 'P25_MATCH_PRECISION_240',
      seriesShotLimit: 5,
      recordedShots: 2,
      seriesComplete: false,
      laneSnapshotCapturedAt: '2026-08-31T01:00:01.000Z',
    },
    recommendation,
    qualificationTimedTargetRecoveryDecisions: [decision],
    qualificationRecoveryExecutions: execution ? [execution] : [],
  });
}

function retainSeriesFixture(
  settlementStatus?: QualificationRecoverySettlementDto['status'],
): RangeInterruptionCaseDto {
  const seriesRecovery = {
    treatment: 'KEEP_RECORDED_SERIES' as const,
    shotsToFire: 0 as const,
    execution: null,
  };
  const recommendation = {
    type: 'QUALIFICATION_TIMED_TARGET' as const,
    interruptionSeconds: 60,
    stageId: 'PRECISION_STAGE',
    extraSighting: { required: false, shots: 0 },
    seriesRecovery,
    ruleReferences: ['8.8.1(c-d)'],
    explanation: 'Retain the completed and recorded series.',
  };
  const decision = {
    id: DECISION_ID,
    caseId: INTERRUPTION_ID,
    supersedesDecisionId: null,
    recommendation,
    authorizedRecovery: { extraSightingSeriesShots: 0, seriesRecovery },
    followsRecommendation: true,
    statement: 'The Jury retains the full recorded series.',
    officialName: 'Jury Member A',
    incidentReportReference: 'RIR-25M-KEEP-001',
    ruleReference: '8.8.1(c-d)',
    decidedAt: '2026-08-31T01:02:00.000Z',
    recordedAt: '2026-08-31T01:02:00.000Z',
  };
  const settlement: QualificationRecoverySettlementDto | null = settlementStatus
    ? {
        settlementId: '77777777-7777-4777-8777-777777777777',
        caseId: INTERRUPTION_ID,
        decisionId: DECISION_ID,
        competitionId: COMPETITION_ID,
        laneId: LANE_ID,
        treatment: 'KEEP_RECORDED_SERIES',
        stageIndex: 1,
        seriesIndex: 0,
        expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
        expectedSeriesShotLimit: 5,
        expectedRecordedShots: 5,
        decisionOfficialName: 'Jury Member A',
        decisionRuleReference: '8.8.1(c-d)',
        decidedAt: '2026-08-31T01:02:00.000Z',
        appliedBy: 'Jury Member B',
        statement: 'The full recorded series was checked and retained.',
        appliedAt: '2026-08-31T01:03:00.000Z',
        requestedAt: '2026-08-31T01:03:00.000Z',
        status: settlementStatus,
        events: [],
      }
    : null;
  return fixture({
    status: 'ENDED',
    qualificationTimedTargetContext: {
      competitionTypeId: 'P25',
      rulePack: {
        id: 'ISSF:2026:P25:QUALIFICATION',
        schemaVersion: 1,
        fingerprintSha256: 'a'.repeat(64),
      },
      stageId: 'PRECISION_STAGE',
      stageIndex: 1,
      seriesIndex: 0,
      timedTargetProgramId: 'P25_MATCH_PRECISION_240',
      seriesShotLimit: 5,
      recordedShots: 5,
      seriesComplete: false,
      laneSnapshotCapturedAt: '2026-08-31T01:00:01.000Z',
    },
    recommendation,
    qualificationTimedTargetRecoveryDecisions: [decision],
    qualificationRecoverySettlements: settlement ? [settlement] : [],
  });
}

describe('RangeInterruptionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByScope.mockResolvedValue({ success: true, data: [fixture()] });
    listAll.mockResolvedValue({ success: true, data: [fixture()] });
    create.mockResolvedValue({ success: true, data: fixture() });
    linkScope.mockResolvedValue({ success: true, data: fixture() });
    appendEntry.mockResolvedValue({ success: true, data: fixture() });
    recordTargetRecovery.mockResolvedValue({ success: true, data: fixture() });
    recordQualificationTimedTargetRecoveryDecision.mockResolvedValue({ success: true, data: fixture() });
    startQualificationRecoveryExecution.mockResolvedValue({ success: true, data: qualificationFixture('ACCEPTED') });
    cancelQualificationRecoveryExecution.mockResolvedValue({ success: true, data: qualificationFixture('CANCELLED') });
    adjudicateQualificationRecoveryExecution.mockResolvedValue({
      success: true,
      data: qualificationFixture('ADJUDICATED'),
    });
    applyQualificationRecoverySettlement.mockResolvedValue({
      success: true,
      data: retainSeriesFixture('APPLIED'),
    });
    pauseLaneTimer.mockResolvedValue({
      success: true,
      data: {
        commandId: '66666666-6666-4666-8666-666666666666',
        action: 'pause-timer',
        success: true,
        lanes: [
          {
            laneId: LANE_ID,
            status: 'done',
            acknowledgedAt: '2026-08-31T01:00:03.000Z',
            data: {
              capturedAt: '2026-08-31T01:00:02.000Z',
              remainingSeconds: 238,
              totalSeconds: 600,
            },
          },
        ],
      },
    });
  });

  it('opens an append-only record without implicitly stopping a Lane', async () => {
    listByScope.mockResolvedValueOnce({ success: true, data: [] });
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        additionalScopes={[{ scopeType: 'EVENT', scopeId: EVENT_ID }]}
        competitionId={COMPETITION_ID}
        defaultLaneId={LANE_ID}
        defaultRemainingSeconds={240}
        lanes={[{ laneId: LANE_ID, label: 'Firing point 12', firingPointNumber: 12 }]}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open record' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Target carrier interruption' } });
    fireEvent.change(screen.getByLabelText('Observed facts'), { target: { value: 'Carrier stopped.' } });
    fireEvent.change(screen.getByLabelText('Opened by'), { target: { value: 'Officer B' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Open record' }).at(-1)!);

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: [
            { scopeType: 'COMPETITION', scopeId: COMPETITION_ID },
            { scopeType: 'EVENT', scopeId: EVENT_ID },
          ],
          laneId: LANE_ID,
          firingPointNumber: 12,
          remainingSecondsAtStart: 240,
          summary: 'Target carrier interruption',
        }),
      ),
    );
    expect(pauseLaneTimer).not.toHaveBeenCalled();
  });

  it('captures the current Lane series for a 25m Qualification policy snapshot', async () => {
    listByScope.mockResolvedValueOnce({ success: true, data: [] });
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        competitionId={COMPETITION_ID}
        qualificationTimedTargetCompetitionTypeId="P25"
        defaultLaneId={LANE_ID}
        lanes={[
          {
            laneId: LANE_ID,
            label: 'Firing point 12',
            firingPointNumber: 12,
            seriesSnapshot: {
              stageIndex: 1,
              seriesIndex: 0,
              recordedShots: 2,
              maxShots: 5,
              seriesComplete: false,
              capturedAt: '2026-08-31T01:00:01.000Z',
            },
          },
        ]}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open record' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: '25m series interruption' } });
    fireEvent.change(screen.getByLabelText('Observed facts'), { target: { value: 'Two shots were recorded.' } });
    fireEvent.change(screen.getByLabelText('Opened by'), { target: { value: 'Officer B' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Open record' }).at(-1)!);

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          qualificationTimedTargetContext: {
            competitionTypeId: 'P25',
            stageIndex: 1,
            seriesIndex: 0,
            recordedShots: 2,
            seriesComplete: false,
            laneSnapshotCapturedAt: '2026-08-31T01:00:01.000Z',
          },
        }),
      ),
    );
  });

  it('keeps the recommendation separate from an explicitly confirmed official grant', async () => {
    const ended = fixture({
      status: 'ENDED',
      entries: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          caseId: INTERRUPTION_ID,
          type: 'ENDED',
          occurredAt: '2026-08-31T01:06:00.000Z',
          statement: 'Interruption ended.',
          officialName: 'Officer A',
          ruleReference: 'ISSF 6.11.3',
          lostTimeSeconds: 360,
          extensionSeconds: null,
          authorizedRemainingSeconds: null,
          unlimitedSightingShots: null,
          incidentReportReference: null,
          commandId: null,
          recordedAt: '2026-08-31T01:06:00.000Z',
        },
      ],
      recommendation: {
        type: 'MATCH_TIME',
        basis: 'SIGHTING_AND_FIVE_MINUTES',
        lostTimeSeconds: 360,
        baseRemainingSeconds: 240,
        suggestedAdditionalSeconds: 360,
        suggestedAuthorizedRemainingSeconds: 600,
        unlimitedSightingShots: true,
        ruleReferences: 'ISSF 6.11.3.1-2',
        explanation: 'Recommendation only.',
      },
    });
    listByScope.mockResolvedValue({ success: true, data: [ended] });
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        competitionId={COMPETITION_ID}
      />,
    );

    expect(await screen.findByText(/not yet an authorization/i)).toBeInTheDocument();
    expect(appendEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Record official grant' }));
    fireEvent.change(screen.getByLabelText('Range Incident Report reference'), { target: { value: 'RIR-42' } });
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'Jury Member C' } });
    fireEvent.change(screen.getByLabelText('Decision statement'), {
      target: { value: 'The Jury grants the recorded remedy.' },
    });
    fireEvent.click(screen.getByLabelText(/I confirm this is an official grant/i));
    fireEvent.click(screen.getAllByRole('button', { name: 'Record official grant' }).at(-1)!);

    await waitFor(() =>
      expect(appendEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: INTERRUPTION_ID,
          type: 'TIME_GRANTED',
          extensionSeconds: 360,
          authorizedRemainingSeconds: 600,
          unlimitedSightingShots: true,
          incidentReportReference: 'RIR-42',
          officialName: 'Jury Member C',
        }),
      ),
    );
  });

  it('appends a Lane STOP only after a separate acknowledged command', async () => {
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        competitionId={COMPETITION_ID}
        lanes={[{ laneId: LANE_ID, label: 'Firing point 12', firingPointNumber: 12 }]}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Apply Lane STOP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send STOP' }));

    await waitFor(() =>
      expect(pauseLaneTimer).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        laneId: LANE_ID,
        interruptionId: INTERRUPTION_ID,
      }),
    );
    expect(appendEntry).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAUSE_APPLIED', commandId: '66666666-6666-4666-8666-666666666666' }),
    );
  });

  it('records a 25m official decision separately from the recommendation and Lane', async () => {
    const ended = fixture({
      status: 'ENDED',
      qualificationTimedTargetContext: {
        competitionTypeId: 'P25',
        rulePack: {
          id: 'ISSF:2026:P25:QUALIFICATION',
          schemaVersion: 1,
          fingerprintSha256: 'a'.repeat(64),
        },
        stageId: 'PRECISION_STAGE',
        stageIndex: 1,
        seriesIndex: 0,
        timedTargetProgramId: 'P25_MATCH_PRECISION_240',
        seriesShotLimit: 5,
        recordedShots: 2,
        seriesComplete: false,
        laneSnapshotCapturedAt: '2026-08-31T01:00:01.000Z',
      },
      recommendation: {
        type: 'QUALIFICATION_TIMED_TARGET',
        interruptionSeconds: 901,
        stageId: 'PRECISION_STAGE',
        extraSighting: { required: true, shots: 5 },
        seriesRecovery: {
          treatment: 'COMPLETE_REMAINING_SHOTS',
          shotsToFire: 3,
          execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 144 },
        },
        ruleReferences: ['8.8.1(a)', '8.8.1(c-d)'],
        explanation: 'Complete the three remaining shots.',
      },
    });
    listByScope.mockResolvedValue({ success: true, data: [ended] });
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        competitionId={COMPETITION_ID}
      />,
    );

    expect(await screen.findByText(/not an authorization/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record official recovery decision' }));
    fireEvent.change(screen.getByLabelText('Range Incident Report reference'), { target: { value: 'RIR-25M-001' } });
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'Jury Member C' } });
    fireEvent.change(screen.getByLabelText('Decision statement'), {
      target: { value: 'The Jury authorizes the recommended recovery.' },
    });
    fireEvent.click(screen.getByLabelText(/I confirm this is an official recovery decision/i));
    fireEvent.click(screen.getByRole('button', { name: 'Record recovery decision' }));

    await waitFor(() =>
      expect(recordQualificationTimedTargetRecoveryDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: INTERRUPTION_ID,
          authorizedRecovery: {
            extraSightingSeriesShots: 5,
            seriesRecovery: {
              treatment: 'COMPLETE_REMAINING_SHOTS',
              shotsToFire: 3,
              execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 144 },
            },
          },
          incidentReportReference: 'RIR-25M-001',
          officialName: 'Jury Member C',
        }),
      ),
    );
    expect(pauseLaneTimer).not.toHaveBeenCalled();
    expect(resumeLaneTimer).not.toHaveBeenCalled();
  });

  it('starts an authorized series recovery only after a separate firing confirmation', async () => {
    listByScope.mockResolvedValue({ success: true, data: [qualificationFixture()] });
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        competitionId={COMPETITION_ID}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start series recovery' }));
    expect(startQualificationRecoveryExecution).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/I confirm the Lane is paused, clear and ready/i));
    fireEvent.click(screen.getByRole('button', { name: 'Start competition series recovery' }));

    await waitFor(() =>
      expect(startQualificationRecoveryExecution).toHaveBeenCalledWith({
        caseId: INTERRUPTION_ID,
        decisionId: DECISION_ID,
        competitionId: COMPETITION_ID,
        phase: 'SERIES_RECOVERY',
      }),
    );
    expect(pauseLaneTimer).not.toHaveBeenCalled();
    expect(resumeLaneTimer).not.toHaveBeenCalled();
  });

  it('cancels an active recovery through the high-level interruption workflow', async () => {
    listByScope.mockResolvedValue({ success: true, data: [qualificationFixture('RUNNING')] });
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        competitionId={COMPETITION_ID}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel run' }));
    fireEvent.change(screen.getByLabelText('Cancellation reason'), {
      target: { value: 'The Jury withdrew the firing authorization.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel recovery run' }));

    await waitFor(() =>
      expect(cancelQualificationRecoveryExecution).toHaveBeenCalledWith({
        caseId: INTERRUPTION_ID,
        runId: RUN_ID,
        reason: 'The Jury withdrew the firing authorization.',
      }),
    );
  });

  it('keeps score application separate and requires an explicit evidence confirmation', async () => {
    listByScope.mockResolvedValue({ success: true, data: [qualificationFixture('COMPLETED')] });
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        competitionId={COMPETITION_ID}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Review and apply score' }));
    expect(screen.getByText(/3 authorized but unfired shot\(s\) will be recorded as misses/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Adjudicating official'), { target: { value: 'Jury Member B' } });
    fireEvent.change(screen.getByLabelText('Adjudication statement'), {
      target: { value: 'The completed Lane evidence was checked and may be scored.' },
    });
    expect(adjudicateQualificationRecoveryExecution).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/authorize this MATCH score change/i));
    fireEvent.click(screen.getByRole('button', { name: 'Apply recovery score' }));

    await waitFor(() =>
      expect(adjudicateQualificationRecoveryExecution).toHaveBeenCalledWith({
        caseId: INTERRUPTION_ID,
        runId: RUN_ID,
        appliedBy: 'Jury Member B',
        statement: 'The completed Lane evidence was checked and may be scored.',
      }),
    );
  });

  it('offers record closure only after the authorized series recovery is adjudicated', async () => {
    listByScope.mockResolvedValue({ success: true, data: [qualificationFixture('ADJUDICATED')] });
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        competitionId={COMPETITION_ID}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Supersede recovery decision' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Record action' }));

    expect(screen.getByRole('option', { name: 'Close record and release hold' })).toBeInTheDocument();
  });

  it('settles a fully recorded series explicitly without starting recovery firing', async () => {
    listByScope.mockResolvedValue({ success: true, data: [retainSeriesFixture()] });
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        competitionId={COMPETITION_ID}
      />,
    );

    expect(await screen.findByText(/It does not fire recovery shots or change scores/i)).toBeInTheDocument();
    expect(screen.queryByText('No action required')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review and retain recorded series' }));
    fireEvent.change(screen.getByLabelText('Applying official'), { target: { value: 'Jury Member B' } });
    fireEvent.change(screen.getByLabelText('Settlement statement'), {
      target: { value: 'The full recorded series was checked and retained.' },
    });
    expect(applyQualificationRecoverySettlement).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/confirm the full recorded series/i));
    fireEvent.click(screen.getByRole('button', { name: 'Retain recorded series' }));

    await waitFor(() =>
      expect(applyQualificationRecoverySettlement).toHaveBeenCalledWith({
        caseId: INTERRUPTION_ID,
        decisionId: DECISION_ID,
        competitionId: COMPETITION_ID,
        appliedBy: 'Jury Member B',
        statement: 'The full recorded series was checked and retained.',
      }),
    );
    expect(startQualificationRecoveryExecution).not.toHaveBeenCalled();
    expect(adjudicateQualificationRecoveryExecution).not.toHaveBeenCalled();
  });

  it('offers closure for a retain-series decision only after Lane settlement is applied', async () => {
    listByScope.mockResolvedValue({ success: true, data: [retainSeriesFixture('APPLIED')] });
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        competitionId={COMPETITION_ID}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Supersede recovery decision' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Record action' }));
    expect(screen.getByRole('option', { name: 'Close record and release hold' })).toBeInTheDocument();
  });
});

import { fixture } from './fixtures';

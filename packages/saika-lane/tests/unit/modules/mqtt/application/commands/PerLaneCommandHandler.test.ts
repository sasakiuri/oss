// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/shared/errors/ErrorCatalog', () => ({
  ErrorCatalog: {
    createError: (code: string, metadata?: Record<string, unknown>) => {
      const err = new Error(metadata?.detail ? `${code}: ${metadata.detail}` : code);
      (err as unknown as { code: string }).code = code;
      return err;
    },
  },
}));

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { IMalfunctionFiringControl, MalfunctionFiringRun } from '@/main/modules/malfunction-firing';
import { CommandIdempotencyGuard } from '@/main/modules/mqtt/application/commands/CommandIdempotencyGuard';
import { PerLaneCommandHandler } from '@/main/modules/mqtt/application/commands/PerLaneCommandHandler';
import type { LaneAssignmentPublisher } from '@/main/modules/mqtt/application/LaneAssignmentPublisher';
import type { LaneCompetitionStatePublisher } from '@/main/modules/mqtt/application/LaneCompetitionStatePublisher';
import type { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type {
  IQualificationRecoveryAdjudicationControl,
  IQualificationRecoveryControl,
  IQualificationRecoverySettlementControl,
} from '@/main/modules/qualification-recovery';
import type { MalfunctionFiringRequestPayload } from '@/shared/mqtt/MalfunctionFiring';

import { createMockCommandBus } from '../../../../../helpers/mockDependencies';

function createMockMqttClient(): IMqttClientService {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    setWill: vi.fn(),
    onMessage: vi.fn().mockReturnValue(() => {}),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

const LANE_ID = 'a1111111-1111-4111-a111-111111111111';
const COMPETITION_ID = 'b2222222-2222-4222-a222-222222222222';
const SESSION_ID = 'd4444444-4444-4444-a444-444444444444';
const INTERRUPTION_ID = 'e5555555-5555-4555-a555-555555555555';
const RECOVERY_RUN_ID = 'f6666666-6666-4666-a666-666666666666';
const RECOVERY_DECISION_ID = 'a7777777-7777-4777-a777-777777777777';

function createMockCompetitionRepo(): ICompetitionRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue({ sessionId: SESSION_ID, phase: 'IDLE' }),
    findBySessionId: vi.fn().mockResolvedValue(null),
    findActive: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function buildCommand(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commandId: 'c3333333-3333-4333-a333-333333333333',
    issuedBy: 'director',
    issuedAt: new Date().toISOString(),
    ...overrides,
  };
}

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

describe('PerLaneCommandHandler', () => {
  let mqttClient: IMqttClientService;
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let guard: CommandIdempotencyGuard;
  let competitionRepo: ICompetitionRepository;
  let assignmentPublisher: LaneAssignmentPublisher;
  let scorePublisher: LaneScorePublisher;
  let competitionStatePublisher: LaneCompetitionStatePublisher;
  let interruptionControl: ICompetitionInterruptionControl;
  let qualificationRecoveryControl: IQualificationRecoveryControl;
  let qualificationRecoveryAdjudicationControl: IQualificationRecoveryAdjudicationControl;
  let qualificationRecoverySettlementControl: IQualificationRecoverySettlementControl;
  let qualificationRecoveryStatePublisher: { publishCurrentState: ReturnType<typeof vi.fn> };
  let malfunctionFiringControl: IMalfunctionFiringControl;
  let safetyStopped: boolean;
  let handler: PerLaneCommandHandler;
  let messageHandler: (topic: string, payload: Buffer) => void;

  beforeEach(() => {
    mqttClient = createMockMqttClient();
    commandBus = createMockCommandBus();
    guard = new CommandIdempotencyGuard();
    competitionRepo = createMockCompetitionRepo();
    assignmentPublisher = {
      assign: vi.fn().mockResolvedValue(undefined),
    } as unknown as LaneAssignmentPublisher;
    scorePublisher = {
      publishCurrentScore: vi.fn().mockResolvedValue(undefined),
    } as unknown as LaneScorePublisher;
    competitionStatePublisher = {
      publishCurrentState: vi.fn().mockResolvedValue(undefined),
    } as unknown as LaneCompetitionStatePublisher;
    interruptionControl = {
      pause: vi.fn().mockResolvedValue({
        interruptionId: 'e5555555-5555-4555-a555-555555555555',
        status: 'PAUSED',
        capturedAt: new Date('2026-08-31T01:00:01.000Z'),
        capturedRemainingSeconds: 240,
        capturedTotalSeconds: 600,
      }),
      resume: vi.fn().mockResolvedValue({
        interruptionId: 'e5555555-5555-4555-a555-555555555555',
        status: 'SIGHTING',
      }),
      resumeMatch: vi.fn().mockResolvedValue({
        interruptionId: 'e5555555-5555-4555-a555-555555555555',
        status: 'RUNNING_MATCH',
      }),
      get: vi.fn().mockReturnValue(null),
      clear: vi.fn(),
    } as unknown as ICompetitionInterruptionControl;
    qualificationRecoveryControl = {
      start: vi.fn().mockResolvedValue({
        runId: RECOVERY_RUN_ID,
        sequenceId: RECOVERY_RUN_ID,
        status: 'RUNNING',
        shots: [],
      }),
      cancel: vi.fn().mockReturnValue({
        runId: RECOVERY_RUN_ID,
        sequenceId: RECOVERY_RUN_ID,
        status: 'CANCELLED',
      }),
      get: vi.fn().mockReturnValue({ runId: RECOVERY_RUN_ID, competitionId: COMPETITION_ID }),
      getLatest: vi.fn().mockReturnValue(null),
      restoreActive: vi.fn().mockReturnValue(null),
    } as unknown as IQualificationRecoveryControl;
    qualificationRecoveryStatePublisher = { publishCurrentState: vi.fn().mockResolvedValue(undefined) };
    qualificationRecoveryAdjudicationControl = {
      get: vi.fn().mockReturnValue(null),
      apply: vi.fn().mockResolvedValue({
        id: 'adjudication-1',
        runId: RECOVERY_RUN_ID,
        competitionId: COMPETITION_ID,
        treatment: 'COMPLETE_REMAINING_SHOTS',
        authorizedShots: 2,
        shots: [{ disposition: 'CREDITED_RECOVERY' }, { disposition: 'CREDITED_MISS' }],
      }),
    } as unknown as IQualificationRecoveryAdjudicationControl;
    qualificationRecoverySettlementControl = {
      get: vi.fn().mockReturnValue(null),
      apply: vi.fn().mockResolvedValue({
        id: 'settlement-1',
        decisionId: RECOVERY_DECISION_ID,
        competitionId: COMPETITION_ID,
        treatment: 'KEEP_RECORDED_SERIES',
        recordedShots: [
          { shotId: 'shot-1' },
          { shotId: 'shot-2' },
          { shotId: 'shot-3' },
          { shotId: 'shot-4' },
          { shotId: 'shot-5' },
        ],
      }),
    } as unknown as IQualificationRecoverySettlementControl;
    safetyStopped = false;
    malfunctionFiringControl = {
      start: vi.fn().mockImplementation(async (request) => firingEvidence(request)),
      read: vi.fn().mockImplementation(() => firingEvidence(firingRequest())),
      cancel: vi.fn().mockImplementation(() => ({ ...firingEvidence(firingRequest()), status: 'CANCELLED' })),
    };
    handler = new PerLaneCommandHandler(
      mqttClient,
      commandBus,
      guard,
      competitionRepo,
      assignmentPublisher,
      scorePublisher,
      competitionStatePublisher,
      interruptionControl,
      () => LANE_ID,
      COMPETITION_ID,
      { isStopped: () => safetyStopped, getState: () => null },
      undefined,
      qualificationRecoveryControl,
      qualificationRecoveryStatePublisher,
      qualificationRecoveryAdjudicationControl,
      qualificationRecoverySettlementControl,
      malfunctionFiringControl,
    );

    (mqttClient.onMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (h: (topic: string, payload: Buffer) => void) => {
        messageHandler = h;
        return () => {
          /* unsubscribe */
        };
      },
    );

    (commandBus.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  async function sendMessage(action: string, payload: Record<string, unknown>): Promise<void> {
    await handler.subscribeToCompetition(COMPETITION_ID);
    const topic = `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/command/${action}`;
    messageHandler(topic, Buffer.from(JSON.stringify(payload)));
    await flushPromises();
  }

  it('subscribes to per-lane command topic', async () => {
    await handler.subscribeToCompetition(COMPETITION_ID);

    expect(mqttClient.subscribe).toHaveBeenCalledWith(
      `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/command/+`,
      1,
    );
  });

  it('unsubscribes from per-lane command topic', async () => {
    await handler.subscribeToCompetition(COMPETITION_ID);
    await handler.unsubscribeFromCompetition();

    expect(mqttClient.unsubscribe).toHaveBeenCalledWith(
      `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/command/+`,
    );
  });

  describe('assign-athlete', () => {
    it('executes AssignAthlete command', async () => {
      const cmd = buildCommand({
        athlete: { startNumber: 1, id: 'athlete-1', name: 'Test Athlete' },
      });

      await sendMessage('assign-athlete', cmd);

      expect(assignmentPublisher.assign).toHaveBeenCalledWith(
        COMPETITION_ID,
        expect.objectContaining({ id: 'athlete-1', name: 'Test Athlete' }),
      );
    });

    it('executes AssignAthlete with null athlete (unassign)', async () => {
      const cmd = buildCommand({ athlete: null });

      await sendMessage('assign-athlete', cmd);

      expect(assignmentPublisher.assign).toHaveBeenCalledWith(COMPETITION_ID, null);
    });
  });

  describe('reset-session', () => {
    it('executes ResetSession command with correct sessionId from competition', async () => {
      const cmd = buildCommand({ reason: 'Device malfunction' });

      await sendMessage('reset-session', cmd);

      expect(competitionRepo.findById).toHaveBeenCalledWith(COMPETITION_ID);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ sessionId: SESSION_ID }),
      );
      expect(scorePublisher.publishCurrentScore).toHaveBeenCalledOnce();
      expect(vi.mocked(commandBus.execute).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(scorePublisher.publishCurrentScore).mock.invocationCallOrder[0]!,
      );
    });

    it('sends an error ACK when the reset score cannot be retained', async () => {
      vi.mocked(scorePublisher.publishCurrentScore).mockRejectedValue(new Error('broker unavailable'));

      await sendMessage('reset-session', buildCommand({ reason: 'Device malfunction' }));

      const ackCalls = vi
        .mocked(mqttClient.publish)
        .mock.calls.filter((call) => (call[0] as string).includes('/acknowledgement'));
      const errorAck = JSON.parse(ackCalls.at(-1)![1] as string);
      expect(errorAck.status).toBe('error');
      expect(errorAck.error.code).toBe('MQTT_COMMAND_EXECUTION_FAILED');
    });

    it('sends error ACK when competition not found', async () => {
      vi.mocked(competitionRepo.findById).mockResolvedValue(null);
      const cmd = buildCommand({ reason: 'Device malfunction' });

      await sendMessage('reset-session', cmd);

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement'));

      // executing ACK + error ACK
      expect(ackCalls.length).toBe(2);
      const errorAck = JSON.parse(ackCalls[1]![1] as string);
      expect(errorAck.status).toBe('error');
      expect(errorAck.error.code).toBe('COMPETITION_NOT_FOUND');
    });

    it('rejects reset after the competition has started', async () => {
      vi.mocked(competitionRepo.findById).mockResolvedValue({
        sessionId: SESSION_ID,
        phase: 'ACTIVE',
      } as Awaited<ReturnType<ICompetitionRepository['findById']>>);

      await sendMessage('reset-session', buildCommand({ reason: 'Device malfunction' }));

      expect(commandBus.execute).not.toHaveBeenCalled();
      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const errorAck = JSON.parse(publishCalls.at(-1)![1] as string);
      expect(errorAck.status).toBe('error');
      expect(errorAck.error.code).toBe('INVALID_PHASE_TRANSITION');
    });
  });

  describe('Lane interruption commands', () => {
    it('pauses only this Lane and returns the captured timer in the done ACK', async () => {
      await sendMessage(
        'pause-timer',
        buildCommand({ interruptionId: INTERRUPTION_ID, pausedAt: '2026-08-31T01:00:00.000Z' }),
      );

      expect(interruptionControl.pause).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        interruptionId: INTERRUPTION_ID,
        pausedAt: new Date('2026-08-31T01:00:00.000Z'),
      });
      expect(competitionStatePublisher.publishCurrentState).toHaveBeenCalledWith(COMPETITION_ID);
      const ack = JSON.parse(vi.mocked(mqttClient.publish).mock.calls.at(-1)![1] as string);
      expect(ack).toMatchObject({
        status: 'done',
        data: { interruptionId: INTERRUPTION_ID, remainingSeconds: 240, totalSeconds: 600 },
      });
    });

    it('applies the authorized timer and a later MATCH transition independently', async () => {
      await sendMessage(
        'resume-timer',
        buildCommand({
          interruptionId: INTERRUPTION_ID,
          timerStartAt: '2026-08-31T01:10:00.000Z',
          authorizedRemainingSeconds: 540,
          unlimitedSightingShots: true,
        }),
      );
      expect(interruptionControl.resume).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        interruptionId: INTERRUPTION_ID,
        timerStartAt: new Date('2026-08-31T01:10:00.000Z'),
        authorizedRemainingSeconds: 540,
        unlimitedSightingShots: true,
      });

      guard.clear();
      await sendMessage('resume-match', buildCommand({ interruptionId: INTERRUPTION_ID }));
      expect(interruptionControl.resumeMatch).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        interruptionId: INTERRUPTION_ID,
      });
    });
  });

  describe('Qualification recovery commands', () => {
    function startCommand() {
      return buildCommand({
        runId: RECOVERY_RUN_ID,
        decisionId: RECOVERY_DECISION_ID,
        interruptionId: INTERRUPTION_ID,
        stageIndex: 1,
        seriesIndex: 0,
        expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
        expectedSeriesShotLimit: 5,
        expectedRecordedShots: 3,
        authorization: {
          phase: 'SERIES_RECOVERY',
          seriesRecovery: {
            treatment: 'COMPLETE_REMAINING_SHOTS',
            shotsToFire: 2,
            execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 96 },
          },
        },
        loadAt: '2026-09-03T01:00:00.000Z',
        officialName: 'Jury Member',
        decisionRuleReference: '8.8.1(c-d)',
        decidedAt: '2026-09-03T00:59:00.000Z',
      });
    }

    it('starts only this Lane run and publishes its retained state before done', async () => {
      await sendMessage('start-qualification-recovery', startCommand());

      expect(qualificationRecoveryControl.start).toHaveBeenCalledWith({
        runId: RECOVERY_RUN_ID,
        decisionId: RECOVERY_DECISION_ID,
        interruptionId: INTERRUPTION_ID,
        competitionId: COMPETITION_ID,
        stageIndex: 1,
        seriesIndex: 0,
        expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
        expectedSeriesShotLimit: 5,
        expectedRecordedShots: 3,
        authorization: {
          phase: 'SERIES_RECOVERY',
          seriesRecovery: {
            treatment: 'COMPLETE_REMAINING_SHOTS',
            shotsToFire: 2,
            execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 96 },
          },
        },
        loadAt: new Date('2026-09-03T01:00:00.000Z'),
        officialName: 'Jury Member',
        decisionRuleReference: '8.8.1(c-d)',
        decidedAt: new Date('2026-09-03T00:59:00.000Z'),
      });
      expect(qualificationRecoveryStatePublisher.publishCurrentState).toHaveBeenCalledWith(COMPETITION_ID);
      const ack = JSON.parse(vi.mocked(mqttClient.publish).mock.calls.at(-1)![1] as string);
      expect(ack).toMatchObject({ status: 'done', data: { runId: RECOVERY_RUN_ID, status: 'RUNNING' } });
    });

    it('cancels by run ID without sharing the generic timer command', async () => {
      await sendMessage(
        'cancel-qualification-recovery',
        buildCommand({ runId: RECOVERY_RUN_ID, reason: 'Jury cancelled the recovery' }),
      );

      expect(qualificationRecoveryControl.cancel).toHaveBeenCalledWith({
        runId: RECOVERY_RUN_ID,
        reason: 'Jury cancelled the recovery',
      });
      expect(interruptionControl.resume).not.toHaveBeenCalled();
    });

    it('applies completed recovery evidence through a distinct adjudication command', async () => {
      await sendMessage(
        'apply-qualification-recovery',
        buildCommand({
          runId: RECOVERY_RUN_ID,
          appliedBy: 'Range Officer B',
          statement: 'Recovery evidence checked.',
          appliedAt: '2026-09-03T01:03:00.000Z',
        }),
      );

      expect(qualificationRecoveryAdjudicationControl.apply).toHaveBeenCalledWith({
        runId: RECOVERY_RUN_ID,
        competitionId: COMPETITION_ID,
        appliedBy: 'Range Officer B',
        statement: 'Recovery evidence checked.',
        appliedAt: new Date('2026-09-03T01:03:00.000Z'),
      });
      expect(competitionStatePublisher.publishCurrentState).toHaveBeenCalledWith(COMPETITION_ID);
      expect(scorePublisher.publishCurrentScore).toHaveBeenCalledWith(COMPETITION_ID);
      const ack = JSON.parse(vi.mocked(mqttClient.publish).mock.calls.at(-1)![1] as string);
      expect(ack).toMatchObject({
        status: 'done',
        data: { runId: RECOVERY_RUN_ID, creditedShots: 2, creditedMisses: 1 },
      });
    });

    it('settles a full recorded series without entering recovery firing or score adjudication', async () => {
      await sendMessage(
        'settle-qualification-recovery',
        buildCommand({
          decisionId: RECOVERY_DECISION_ID,
          interruptionId: INTERRUPTION_ID,
          stageIndex: 1,
          seriesIndex: 0,
          expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
          expectedSeriesShotLimit: 5,
          expectedRecordedShots: 5,
          treatment: 'KEEP_RECORDED_SERIES',
          decisionOfficialName: 'Jury Member A',
          decisionRuleReference: '8.8.1(c-d)',
          decidedAt: '2026-09-03T01:02:00.000Z',
          appliedBy: 'Jury Member B',
          statement: 'The full recorded series was checked and retained.',
          appliedAt: '2026-09-03T01:03:00.000Z',
        }),
      );

      expect(qualificationRecoverySettlementControl.apply).toHaveBeenCalledWith({
        decisionId: RECOVERY_DECISION_ID,
        competitionId: COMPETITION_ID,
        interruptionId: INTERRUPTION_ID,
        stageIndex: 1,
        seriesIndex: 0,
        expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
        expectedSeriesShotLimit: 5,
        expectedRecordedShots: 5,
        treatment: 'KEEP_RECORDED_SERIES',
        decisionOfficialName: 'Jury Member A',
        decisionRuleReference: '8.8.1(c-d)',
        decidedAt: new Date('2026-09-03T01:02:00.000Z'),
        appliedBy: 'Jury Member B',
        statement: 'The full recorded series was checked and retained.',
        appliedAt: new Date('2026-09-03T01:03:00.000Z'),
      });
      expect(qualificationRecoveryControl.start).not.toHaveBeenCalled();
      expect(qualificationRecoveryAdjudicationControl.apply).not.toHaveBeenCalled();
      const ack = JSON.parse(vi.mocked(mqttClient.publish).mock.calls.at(-1)![1] as string);
      expect(ack).toMatchObject({
        status: 'done',
        data: { decisionId: RECOVERY_DECISION_ID, retainedShots: 5 },
      });
    });
  });

  function firingRequest(): MalfunctionFiringRequestPayload {
    return {
      runId: RECOVERY_RUN_ID,
      competitionId: COMPETITION_ID,
      caseId: INTERRUPTION_ID,
      authorizationId: RECOVERY_DECISION_ID,
      participantId: 'athlete-1',
      sessionId: SESSION_ID,
      rulePackFingerprint: 'a'.repeat(64),
      stageIndex: 1,
      seriesIndex: 0,
      recordedShots: 2,
      remedy: 'COMPLETE_REMAINING_SHOTS',
      shotsToFire: 3,
      officialName: 'RO',
      decidedAt: '2026-09-07T00:00:00.000Z',
      loadAt: '2026-09-07T00:01:00.000Z',
    };
  }
  function firingEvidence(request: MalfunctionFiringRequestPayload) {
    return {
      request,
      status: 'COMPLETED',
      captureIssues: [],
      terminalReason: 'Completed',
      startedAt: request.loadAt,
      targetProfileId: 'ISSF_25M_PRECISION',
      shots: [],
    } as unknown as MalfunctionFiringRun;
  }

  describe('isolated malfunction firing commands', () => {
    it('returns validated durable evidence in the ACK without publishing normal scores', async () => {
      await sendMessage('start-malfunction-firing', buildCommand({ request: firingRequest() }));
      expect(malfunctionFiringControl.start).toHaveBeenCalledWith(firingRequest());
      const ack = JSON.parse(vi.mocked(mqttClient.publish).mock.calls.at(-1)![1] as string);
      expect(ack).toMatchObject({ status: 'done', data: { evidence: firingEvidence(firingRequest()) } });
      expect(scorePublisher.publishCurrentScore).not.toHaveBeenCalled();
      expect(commandBus.execute).not.toHaveBeenCalled();
    });

    it.each(['start-malfunction-firing', 'read-malfunction-firing', 'cancel-malfunction-firing'])(
      'validates %s before invoking acquisition',
      async (action) => {
        await sendMessage(action, buildCommand({ runId: 'invalid', request: { ...firingRequest(), shotsToFire: 6 } }));
        expect(malfunctionFiringControl.start).not.toHaveBeenCalled();
        expect(malfunctionFiringControl.read).not.toHaveBeenCalled();
        expect(malfunctionFiringControl.cancel).not.toHaveBeenCalled();
        const ack = JSON.parse(vi.mocked(mqttClient.publish).mock.calls.at(-1)![1] as string);
        expect(ack).toMatchObject({ status: 'error', error: { code: 'MQTT_COMMAND_VALIDATION_FAILED' } });
      },
    );

    it('rejects a cross-competition authorization before execution', async () => {
      await sendMessage(
        'start-malfunction-firing',
        buildCommand({ request: { ...firingRequest(), competitionId: LANE_ID } }),
      );
      expect(malfunctionFiringControl.start).not.toHaveBeenCalled();
    });

    it('allows evidence retrieval and cancellation during STOP while blocking new firing', async () => {
      safetyStopped = true;
      await sendMessage('start-malfunction-firing', buildCommand({ request: firingRequest() }));
      expect(malfunctionFiringControl.start).not.toHaveBeenCalled();
      guard.clear();
      await sendMessage('read-malfunction-firing', buildCommand({ runId: RECOVERY_RUN_ID }));
      expect(malfunctionFiringControl.read).toHaveBeenCalledWith(COMPETITION_ID, RECOVERY_RUN_ID);
      guard.clear();
      await sendMessage('cancel-malfunction-firing', buildCommand({ runId: RECOVERY_RUN_ID, reason: 'Official stop' }));
      expect(malfunctionFiringControl.cancel).toHaveBeenCalledWith(
        COMPETITION_ID,
        RECOVERY_RUN_ID,
        'Official stop',
        undefined,
      );
      const ack = JSON.parse(vi.mocked(mqttClient.publish).mock.calls.at(-1)![1] as string);
      expect(ack).toMatchObject({ status: 'done', data: { evidence: { status: 'CANCELLED' } } });
    });
  });

  describe('2-phase ACK', () => {
    it('sends executing then done ACK on success', async () => {
      const cmd = buildCommand({ athlete: null });

      await sendMessage('assign-athlete', cmd);

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement'));

      expect(ackCalls.length).toBe(2);

      const executingAck = JSON.parse(ackCalls[0]![1] as string);
      expect(executingAck.status).toBe('executing');

      const doneAck = JSON.parse(ackCalls[1]![1] as string);
      expect(doneAck.status).toBe('done');
    });

    it('sends error ACK on failure', async () => {
      vi.mocked(assignmentPublisher.assign).mockRejectedValue(new Error('failed'));
      const cmd = buildCommand({ athlete: null });

      await sendMessage('assign-athlete', cmd);

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement'));

      expect(ackCalls.length).toBe(2);
      const errorAck = JSON.parse(ackCalls[1]![1] as string);
      expect(errorAck.status).toBe('error');
    });
  });

  describe('ACK topic format', () => {
    it('uses correct per-lane ACK topic', async () => {
      const cmd = buildCommand({ athlete: null });

      await sendMessage('assign-athlete', cmd);

      const expectedAckTopic = `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/command/assign-athlete/acknowledgement`;
      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      expect(publishCalls[0]![0]).toBe(expectedAckTopic);
    });
  });

  describe('unknown action', () => {
    it('sends error ACK for unknown action', async () => {
      await sendMessage('unknown', buildCommand());

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackPayload = JSON.parse(publishCalls[0]![1] as string);
      expect(ackPayload.status).toBe('error');
      expect(ackPayload.error.code).toBe('MQTT_UNKNOWN_COMMAND_ACTION');
    });
  });
});

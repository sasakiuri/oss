// SPDX-License-Identifier: MIT
/**
 * PerLaneCommandHandler
 *
 * @description
 * Handler that processes lane-specific commands.
 * Subscribes to `saika/competition/{competitionId}/lane/{laneId}/command/+` and
 * executes assign-athlete / reset-session via CommandBus.
 */

import type { z } from 'zod';

import { FinishCompetitionToken, ResetSessionToken } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { LaneAssignmentPublisher } from '@/main/modules/mqtt/application/LaneAssignmentPublisher';
import type { LaneCompetitionStatePublisher } from '@/main/modules/mqtt/application/LaneCompetitionStatePublisher';
import type { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';
import type { QualificationRecoveryStatePublisher } from '@/main/modules/mqtt/application/QualificationRecoveryStatePublisher';
import {
  CommandAuthorizationPolicy,
  type ICommandAuthorizationPolicy,
} from '@/main/modules/mqtt/domain/CommandAuthorizationPolicy';
import type { Athlete } from '@/main/modules/mqtt/domain/MqttAssignmentSchemas';
import type { CommandAckPayload } from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import {
  ApplyQualificationRecoveryCmdSchema,
  AssignAthleteCmdSchema,
  CancelQualificationRecoveryCmdSchema,
  PauseTimerCmdSchema,
  ResetSessionCmdSchema,
  RetireFinalistCmdSchema,
  ResumeMatchCmdSchema,
  ResumeTimerCmdSchema,
  SettleQualificationRecoveryCmdSchema,
  StartQualificationRecoveryCmdSchema,
} from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import type { CommandIdempotencyGuard } from '@/main/modules/mqtt/infra/CommandIdempotencyGuard';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type {
  IQualificationRecoveryAdjudicationControl,
  IQualificationRecoveryControl,
  IQualificationRecoverySettlementControl,
  StartQualificationRecoveryRunInput,
} from '@/main/modules/qualification-recovery';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

type PerLaneAction =
  | 'assign-athlete'
  | 'reset-session'
  | 'pause-timer'
  | 'resume-timer'
  | 'resume-match'
  | 'start-qualification-recovery'
  | 'cancel-qualification-recovery'
  | 'apply-qualification-recovery'
  | 'settle-qualification-recovery'
  | 'retire-finalist';

const ACTION_SCHEMAS: Record<PerLaneAction, z.ZodType> = {
  'assign-athlete': AssignAthleteCmdSchema,
  'reset-session': ResetSessionCmdSchema,
  'pause-timer': PauseTimerCmdSchema,
  'resume-timer': ResumeTimerCmdSchema,
  'resume-match': ResumeMatchCmdSchema,
  'start-qualification-recovery': StartQualificationRecoveryCmdSchema,
  'cancel-qualification-recovery': CancelQualificationRecoveryCmdSchema,
  'apply-qualification-recovery': ApplyQualificationRecoveryCmdSchema,
  'settle-qualification-recovery': SettleQualificationRecoveryCmdSchema,
  'retire-finalist': RetireFinalistCmdSchema,
};

/** Parsed parts of the topic */
interface ParsedPerLaneTopic {
  competitionId: string;
  laneId: string;
  action: string;
}

export class PerLaneCommandHandler {
  private subscribedTopic: string | null = null;
  private messageUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly commandBus: CommandBus,
    private readonly idempotencyGuard: CommandIdempotencyGuard,
    private readonly competitionRepository: ICompetitionRepository,
    private readonly assignmentPublisher: LaneAssignmentPublisher,
    private readonly scorePublisher: LaneScorePublisher,
    private readonly competitionStatePublisher: LaneCompetitionStatePublisher,
    private readonly interruptionControl: ICompetitionInterruptionControl,
    private readonly getLaneId: () => string,
    _competitionId: string,
    private readonly safetyStopControl?: Pick<ILaneSafetyStopControl, 'isStopped' | 'getState'>,
    private readonly commandAuthorization: ICommandAuthorizationPolicy = new CommandAuthorizationPolicy(),
    private readonly qualificationRecoveryControl?: IQualificationRecoveryControl,
    private readonly qualificationRecoveryStatePublisher?: Pick<
      QualificationRecoveryStatePublisher,
      'publishCurrentState'
    >,
    private readonly qualificationRecoveryAdjudicationControl?: IQualificationRecoveryAdjudicationControl,
    private readonly qualificationRecoverySettlementControl?: IQualificationRecoverySettlementControl,
  ) {}

  /**
   * Subscribes to lane-specific commands
   */
  async subscribeToCompetition(competitionId: string): Promise<void> {
    await this.unsubscribeFromCompetition();

    const topic = `saika/competition/${competitionId}/lane/${this.getLaneId()}/command/+`;
    this.subscribedTopic = topic;

    await this.mqttClient.subscribe(topic, 1);

    this.messageUnsubscribe = this.mqttClient.onMessage((msgTopic: string, payload: Buffer) => {
      const parsed = this.parseTopic(msgTopic);
      if (!parsed) return;
      if (parsed.laneId !== this.getLaneId()) return;

      void this.handleCommand(parsed, payload);
    });
  }

  /**
   * Unsubscribes from the competition
   */
  async unsubscribeFromCompetition(): Promise<void> {
    this.messageUnsubscribe?.();
    this.messageUnsubscribe = null;

    if (this.subscribedTopic) {
      try {
        await this.mqttClient.unsubscribe(this.subscribedTopic);
      } catch {
        // Ignore if already disconnected
      }
      this.subscribedTopic = null;
    }
  }

  /**
   * Parses the topic
   * saika/competition/{competitionId}/lane/{laneId}/command/{action}
   */
  private parseTopic(topic: string): ParsedPerLaneTopic | null {
    const segments = topic.split('/');
    if (segments.length !== 7) return null;
    if (segments[0] !== 'saika' || segments[1] !== 'competition') return null;
    if (segments[3] !== 'lane') return null;
    if (segments[5] !== 'command') return null;

    return {
      competitionId: segments[2]!,
      laneId: segments[4]!,
      action: segments[6]!,
    };
  }

  /**
   * Processes a command
   */
  private async handleCommand(parsed: ParsedPerLaneTopic, payload: Buffer): Promise<void> {
    const logger = getLogger();
    const { action, competitionId } = parsed;
    const ackTopic = `saika/competition/${competitionId}/lane/${this.getLaneId()}/command/${action}/acknowledgement`;

    // JSON parse
    let rawData: unknown;
    try {
      rawData = JSON.parse(payload.toString());
    } catch {
      logger.error('[PerLaneCommandHandler] Failed to parse JSON', 'mqtt', { action });
      return;
    }

    // Action schema validation
    const schema = ACTION_SCHEMAS[action as PerLaneAction];
    if (!schema) {
      const error = ErrorCatalog.createError('MQTT_UNKNOWN_COMMAND_ACTION', { action });
      await this.publishAck(ackTopic, '', 'error', error.code, error.message);
      return;
    }

    const parseResult = schema.safeParse(rawData);
    if (!parseResult.success) {
      const error = ErrorCatalog.createError('MQTT_COMMAND_VALIDATION_FAILED', {
        action,
        detail: parseResult.error.message,
      });
      const commandId = (rawData as { commandId?: string }).commandId ?? '';
      await this.publishAck(ackTopic, commandId, 'error', error.code, error.message);
      return;
    }

    const command = parseResult.data as Record<string, unknown>;
    const commandId = command.commandId as string;
    const authorization = this.commandAuthorization.assess({
      issuedBy: command.issuedBy as string,
      ...(typeof command.issuerId === 'string' ? { issuerId: command.issuerId } : {}),
    });
    if (!authorization.allowed) {
      const error = ErrorCatalog.createError('MQTT_COMMAND_UNAUTHORIZED', { detail: authorization.reason });
      await this.publishAck(ackTopic, commandId, 'error', error.code, error.message);
      return;
    }

    // Idempotency check
    if (this.idempotencyGuard.check(commandId)) {
      logger.info(`[PerLaneCommandHandler] Duplicate command skipped: ${commandId}`, 'mqtt');
      return;
    }

    // executing ACK
    await this.publishAck(ackTopic, commandId, 'executing');

    try {
      const data = await this.executeAction(action as PerLaneAction, command, competitionId);
      await this.publishAck(ackTopic, commandId, 'done', undefined, undefined, data, authorization.warning);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorCode = (err as { code?: string }).code ?? 'MQTT_COMMAND_EXECUTION_FAILED';
      logger.error(`[PerLaneCommandHandler] Command failed: ${action}`, 'mqtt', {
        error: errorMessage,
        commandId,
      });
      await this.publishAck(ackTopic, commandId, 'error', errorCode, errorMessage);
    }
  }

  /**
   * Executes an action
   */
  private async executeAction(
    action: PerLaneAction,
    command: Record<string, unknown>,
    competitionId: string,
  ): Promise<Record<string, unknown> | undefined> {
    switch (action) {
      case 'assign-athlete': {
        const athlete = command.athlete as Athlete | null;
        await this.assignmentPublisher.assign(competitionId, athlete);
        return undefined;
      }

      case 'reset-session': {
        // ResetSession requires a sessionId. Retrieve CompetitionState from competitionId to resolve sessionId.
        const competition = await this.competitionRepository.findById(competitionId);
        if (!competition) {
          throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { competitionId });
        }
        if (competition.phase !== 'IDLE') {
          throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
            detail: `reset-session is only allowed before competition start; current phase is ${competition.phase}`,
          });
        }
        await this.commandBus.execute(ResetSessionToken, {
          sessionId: competition.sessionId,
        });
        // A successful reset acknowledgement guarantees that the broker no
        // longer retains the pre-reset score.
        await this.scorePublisher.publishCurrentScore();
        return undefined;
      }

      case 'pause-timer': {
        const record = await this.interruptionControl.pause({
          competitionId,
          interruptionId: command.interruptionId as string,
          pausedAt: new Date(command.pausedAt as string),
        });
        await this.competitionStatePublisher.publishCurrentState(competitionId);
        return {
          interruptionId: record.interruptionId,
          status: record.status,
          capturedAt: record.capturedAt.toISOString(),
          remainingSeconds: record.capturedRemainingSeconds,
          totalSeconds: record.capturedTotalSeconds,
        };
      }

      case 'resume-timer': {
        this.assertSafetyCleared(action);
        const record = await this.interruptionControl.resume({
          competitionId,
          interruptionId: command.interruptionId as string,
          timerStartAt: new Date(command.timerStartAt as string),
          authorizedRemainingSeconds: command.authorizedRemainingSeconds as number,
          unlimitedSightingShots: command.unlimitedSightingShots as boolean,
        });
        await this.competitionStatePublisher.publishCurrentState(competitionId);
        return { interruptionId: record.interruptionId, status: record.status };
      }

      case 'resume-match': {
        this.assertSafetyCleared(action);
        const record = await this.interruptionControl.resumeMatch({
          competitionId,
          interruptionId: command.interruptionId as string,
        });
        await this.competitionStatePublisher.publishCurrentState(competitionId);
        return { interruptionId: record.interruptionId, status: record.status };
      }

      case 'start-qualification-recovery': {
        this.assertSafetyCleared(action);
        const control = this.requireQualificationRecoveryControl();
        const record = await control.start({
          runId: command.runId as string,
          decisionId: command.decisionId as string,
          interruptionId: command.interruptionId as string,
          competitionId,
          stageIndex: command.stageIndex as number,
          seriesIndex: command.seriesIndex as number,
          expectedMatchProgramId: command.expectedMatchProgramId as string,
          expectedSeriesShotLimit: command.expectedSeriesShotLimit as number,
          expectedRecordedShots: command.expectedRecordedShots as number,
          authorization: command.authorization as StartQualificationRecoveryRunInput['authorization'],
          loadAt: new Date(command.loadAt as string),
          officialName: command.officialName as string,
          decisionRuleReference: command.decisionRuleReference as string,
          decidedAt: new Date(command.decidedAt as string),
        });
        await this.qualificationRecoveryStatePublisher?.publishCurrentState(competitionId);
        return {
          runId: record.runId,
          sequenceId: record.sequenceId,
          status: record.status,
          recordedShots: record.shots.length,
        };
      }

      case 'cancel-qualification-recovery': {
        this.assertSafetyCleared(action);
        const control = this.requireQualificationRecoveryControl();
        const current = control.get(command.runId as string);
        if (!current || current.competitionId !== competitionId) {
          throw new Error(`Qualification recovery run ${command.runId as string} does not belong to this competition`);
        }
        const record = control.cancel({ runId: current.runId, reason: command.reason as string });
        await this.qualificationRecoveryStatePublisher?.publishCurrentState(competitionId);
        return { runId: record.runId, sequenceId: record.sequenceId, status: record.status };
      }

      case 'apply-qualification-recovery': {
        const control = this.requireQualificationRecoveryAdjudicationControl();
        const current = control.get(command.runId as string);
        if (current && current.competitionId !== competitionId) {
          throw new Error(`Qualification recovery run ${command.runId as string} does not belong to this competition`);
        }
        const record = await control.apply({
          runId: command.runId as string,
          competitionId,
          appliedBy: command.appliedBy as string,
          statement: command.statement as string,
          appliedAt: new Date(command.appliedAt as string),
        });
        await Promise.all([
          this.competitionStatePublisher.publishCurrentState(competitionId),
          this.scorePublisher.publishCurrentScore(competitionId),
        ]);
        return {
          adjudicationId: record.id,
          runId: record.runId,
          treatment: record.treatment,
          creditedShots: record.authorizedShots,
          creditedMisses: record.shots.filter((shot) => shot.disposition === 'CREDITED_MISS').length,
        };
      }

      case 'settle-qualification-recovery': {
        const control = this.requireQualificationRecoverySettlementControl();
        const current = control.get(command.decisionId as string);
        if (current && current.competitionId !== competitionId) {
          throw new Error(
            `Qualification recovery decision ${command.decisionId as string} does not belong to this competition`,
          );
        }
        const record = await control.apply({
          decisionId: command.decisionId as string,
          competitionId,
          interruptionId: command.interruptionId as string,
          treatment: command.treatment as 'KEEP_RECORDED_SERIES',
          stageIndex: command.stageIndex as number,
          seriesIndex: command.seriesIndex as number,
          expectedMatchProgramId: command.expectedMatchProgramId as string,
          expectedSeriesShotLimit: command.expectedSeriesShotLimit as number,
          expectedRecordedShots: command.expectedRecordedShots as number,
          decisionOfficialName: command.decisionOfficialName as string,
          decisionRuleReference: command.decisionRuleReference as string,
          decidedAt: new Date(command.decidedAt as string),
          appliedBy: command.appliedBy as string,
          statement: command.statement as string,
          appliedAt: new Date(command.appliedAt as string),
        });
        await Promise.all([
          this.competitionStatePublisher.publishCurrentState(competitionId),
          this.scorePublisher.publishCurrentScore(competitionId),
        ]);
        return {
          settlementId: record.id,
          decisionId: record.decisionId,
          treatment: record.treatment,
          retainedShots: record.recordedShots.length,
        };
      }

      case 'retire-finalist': {
        const competition = await this.competitionRepository.findById(competitionId);
        if (!competition) throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: competitionId });
        if (competition.config.name !== 'Final') {
          throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
            detail: `retire-finalist requires a Final; current round is ${competition.config.name}`,
          });
        }
        if (competition.phase !== 'FINISHED') {
          await this.commandBus.execute(FinishCompetitionToken, { competitionId });
        }
        const finalSnapshotCommandId = command.commandId as string;
        await Promise.all([
          this.competitionStatePublisher.publishCurrentState(competitionId, finalSnapshotCommandId),
          this.scorePublisher.publishCurrentScore(competitionId, finalSnapshotCommandId),
        ]);
        return {
          checkpointId: command.checkpointId,
          rank: command.rank,
          afterShot: command.afterShot,
        };
      }
    }
  }

  private assertSafetyCleared(action: string): void {
    if (!this.safetyStopControl?.isStopped()) return;
    const safetyStopId = this.safetyStopControl.getState()?.safetyStopId ?? 'unknown';
    throw new Error(`Safety stop ${safetyStopId} is active; ${action} is blocked`);
  }

  private requireQualificationRecoveryControl(): IQualificationRecoveryControl {
    if (!this.qualificationRecoveryControl) throw new Error('Lane Qualification recovery control is unavailable');
    return this.qualificationRecoveryControl;
  }

  private requireQualificationRecoveryAdjudicationControl(): IQualificationRecoveryAdjudicationControl {
    if (!this.qualificationRecoveryAdjudicationControl) {
      throw new Error('Lane Qualification recovery adjudication control is unavailable');
    }
    return this.qualificationRecoveryAdjudicationControl;
  }

  private requireQualificationRecoverySettlementControl(): IQualificationRecoverySettlementControl {
    if (!this.qualificationRecoverySettlementControl) {
      throw new Error('Qualification recovery settlement is unavailable');
    }
    return this.qualificationRecoverySettlementControl;
  }

  /**
   * Publishes an ACK
   */
  private async publishAck(
    topic: string,
    commandId: string,
    status: CommandAckPayload['status'],
    errorCode?: string,
    errorMessage?: string,
    data?: Record<string, unknown>,
    warning?: string,
  ): Promise<void> {
    const ack: CommandAckPayload = {
      commandId,
      laneId: this.getLaneId(),
      status,
      acknowledgedAt: new Date().toISOString(),
      ...(errorCode && errorMessage ? { error: { code: errorCode, message: errorMessage } } : {}),
      ...(data ? { data } : {}),
      ...(warning ? { warning } : {}),
    };

    try {
      await this.mqttClient.publish(topic, JSON.stringify(ack), { qos: 1, retain: false });
    } catch (err) {
      getLogger().error('[PerLaneCommandHandler] Failed to publish ACK', 'mqtt', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

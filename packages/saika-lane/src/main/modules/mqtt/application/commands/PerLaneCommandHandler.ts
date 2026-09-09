// SPDX-License-Identifier: MIT
/**
 * PerLaneCommandHandler
 *
 * @description
 * Handler that processes lane-specific commands.
 * Subscribes to `saika/competition/{competitionId}/lane/{laneId}/command/+` and
 * executes assign-athlete / reset-session via CommandBus.
 */

import { FinishCompetitionToken, ResetSessionToken } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { IMalfunctionFiringControl, MalfunctionFiringRequest } from '@/main/modules/malfunction-firing';
import type { CommandIdempotencyGuard } from '@/main/modules/mqtt/application/commands/CommandIdempotencyGuard';
import type { LaneAssignmentPublisher } from '@/main/modules/mqtt/application/LaneAssignmentPublisher';
import type { LaneCompetitionStatePublisher } from '@/main/modules/mqtt/application/LaneCompetitionStatePublisher';
import type { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';
import type { QualificationRecoveryStatePublisher } from '@/main/modules/mqtt/application/QualificationRecoveryStatePublisher';
import {
  CommandAuthorizationPolicy,
  type ICommandAuthorizationPolicy,
} from '@/main/modules/mqtt/domain/CommandAuthorizationPolicy';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { Athlete } from '@/main/modules/mqtt/domain/MqttAssignmentSchemas';
import {
  ReserveLaneTransferCmdSchema,
  ApplyQualificationRecoveryCmdSchema,
  StartMalfunctionFiringCmdSchema,
  ReadMalfunctionFiringCmdSchema,
  CancelMalfunctionFiringCmdSchema,
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
import type {
  IQualificationRecoveryAdjudicationControl,
  IQualificationRecoveryControl,
  IQualificationRecoverySettlementControl,
  StartQualificationRecoveryRunInput,
} from '@/main/modules/qualification-recovery';
import type { IReserveLaneTransferControl } from '@/main/modules/reserve-lane-transfer/domain/ReserveLaneTransfer';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { MalfunctionFiringEvidenceSchema } from '@/shared/mqtt/MalfunctionFiring';
import type { ReserveLaneTransferAction } from '@/shared/mqtt/ReserveLaneTransfer';

import { LaneCommandProcessor, type LaneCommandSchemas } from './LaneCommandProcessor';

type PerLaneAction =
  | 'reserve-lane-transfer'
  | 'start-malfunction-firing'
  | 'read-malfunction-firing'
  | 'cancel-malfunction-firing'
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

const ACTION_SCHEMAS: LaneCommandSchemas<PerLaneAction> = {
  'reserve-lane-transfer': ReserveLaneTransferCmdSchema,
  'start-malfunction-firing': StartMalfunctionFiringCmdSchema,
  'read-malfunction-firing': ReadMalfunctionFiringCmdSchema,
  'cancel-malfunction-firing': CancelMalfunctionFiringCmdSchema,
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
  private readonly processor: LaneCommandProcessor;
  private subscribedTopic: string | null = null;
  private messageUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly commandBus: CommandBus,
    idempotencyGuard: CommandIdempotencyGuard,
    private readonly competitionRepository: ICompetitionRepository,
    private readonly assignmentPublisher: LaneAssignmentPublisher,
    private readonly scorePublisher: LaneScorePublisher,
    private readonly competitionStatePublisher: LaneCompetitionStatePublisher,
    private readonly interruptionControl: ICompetitionInterruptionControl,
    private readonly getLaneId: () => string,
    _competitionId: string,
    private readonly safetyStopControl?: Pick<ILaneSafetyStopControl, 'isStopped' | 'getState'>,
    commandAuthorization: ICommandAuthorizationPolicy = new CommandAuthorizationPolicy(),
    private readonly qualificationRecoveryControl?: IQualificationRecoveryControl,
    private readonly qualificationRecoveryStatePublisher?: Pick<
      QualificationRecoveryStatePublisher,
      'publishCurrentState'
    >,
    private readonly qualificationRecoveryAdjudicationControl?: IQualificationRecoveryAdjudicationControl,
    private readonly qualificationRecoverySettlementControl?: IQualificationRecoverySettlementControl,
    private readonly malfunctionFiringControl?: IMalfunctionFiringControl,
    private readonly reserveTransferControl?: IReserveLaneTransferControl,
    private readonly replayTransferredSession?: (competitionId: string) => Promise<void>,
  ) {
    this.processor = new LaneCommandProcessor(
      mqttClient,
      idempotencyGuard,
      commandAuthorization,
      getLaneId,
      'PerLaneCommandHandler',
    );
  }

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
  private handleCommand(parsed: ParsedPerLaneTopic, payload: Buffer): Promise<void> {
    return this.processor.handle<PerLaneAction>({
      action: parsed.action,
      payload,
      schemas: ACTION_SCHEMAS,
      acknowledgementTopic: `saika/competition/${parsed.competitionId}/lane/${this.getLaneId()}/command/${parsed.action}/acknowledgement`,
      execute: (action, command) => this.executeAction(action, command, parsed.competitionId),
    });
  }

  /**
   * Executes an action
   */
  private async executeAction(
    action: PerLaneAction,
    command: Record<string, unknown>,
    competitionId: string,
  ): Promise<Record<string, unknown> | undefined> {
    if (action !== 'reserve-lane-transfer' && action !== 'read-malfunction-firing')
      this.reserveTransferControl?.assertMutationAllowed();
    switch (action) {
      case 'reserve-lane-transfer': {
        if (!this.reserveTransferControl) throw new Error('Reserve transfer is unavailable');
        const transfer = command.transfer as ReserveLaneTransferAction;
        const transferCompetitionId =
          transfer.operation === 'PREPARE_SOURCE'
            ? transfer.request.competitionId
            : 'bundle' in transfer
              ? transfer.bundle.request.competitionId
              : competitionId;
        if (transferCompetitionId !== competitionId) throw new Error('Transfer belongs to another competition');
        const bundle = await this.reserveTransferControl.execute(competitionId, transfer);
        if (bundle.request.competitionId !== competitionId) throw new Error('Transfer belongs to another competition');
        if (transfer.operation === 'ACTIVATE_TARGET') await this.replayTransferredSession?.(competitionId);
        await this.competitionStatePublisher.publishCurrentState(competitionId);
        await this.scorePublisher.publishCurrentScore(competitionId);
        return { bundle };
      }
      case 'start-malfunction-firing': {
        this.assertSafetyCleared(action);
        if (!this.malfunctionFiringControl) throw new Error('Malfunction firing is unavailable');
        const request = command.request as MalfunctionFiringRequest;
        if (request.competitionId !== competitionId) throw new Error('Firing request has a different competition');
        return { evidence: MalfunctionFiringEvidenceSchema.parse(await this.malfunctionFiringControl.start(request)) };
      }
      case 'read-malfunction-firing': {
        if (!this.malfunctionFiringControl) throw new Error('Malfunction firing is unavailable');
        return {
          evidence: MalfunctionFiringEvidenceSchema.parse(
            this.malfunctionFiringControl.read(competitionId, command.runId as string),
          ),
        };
      }
      case 'cancel-malfunction-firing': {
        if (!this.malfunctionFiringControl) throw new Error('Malfunction firing is unavailable');
        return {
          evidence: MalfunctionFiringEvidenceSchema.parse(
            this.malfunctionFiringControl.cancel(
              competitionId,
              command.runId as string,
              command.reason as string,
              command.request as MalfunctionFiringRequest | undefined,
            ),
          ),
        };
      }
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
}

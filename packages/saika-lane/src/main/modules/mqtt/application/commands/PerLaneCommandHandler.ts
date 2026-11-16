// SPDX-License-Identifier: MIT
/** Handles commands addressed to one Lane within a competition. */

import { commandSchemasForScope, type MqttCommandActionOf } from '@sasakiuri/saika-protocol/commands';
import type { Athlete } from '@sasakiuri/saika-protocol/LaneAssignment';
import { MalfunctionFiringEvidenceSchema } from '@sasakiuri/saika-protocol/MalfunctionFiring';
import type { ReserveLaneTransferAction } from '@sasakiuri/saika-protocol/ReserveLaneTransfer';
import { mqttTopicFilters, mqttTopics, parseMqttTopic, type ParsedMqttTopicOf } from '@sasakiuri/saika-protocol/topics';

import { FinishCompetitionToken, ResetSessionToken } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { IMalfunctionFiringControl, MalfunctionFiringRequest } from '@/main/modules/malfunction-firing';
import type { LaneAssignmentPublisher } from '@/main/modules/mqtt/application/LaneAssignmentPublisher';
import type { LaneCompetitionStatePublisher } from '@/main/modules/mqtt/application/LaneCompetitionStatePublisher';
import type { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';
import type { QualificationRecoveryStatePublisher } from '@/main/modules/mqtt/application/QualificationRecoveryStatePublisher';
import { TopicSubscription } from '@/main/modules/mqtt/application/TopicSubscription';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { laneCommandSchemas } from '@/main/modules/mqtt/domain/MqttCommandSchemas';
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

import type { LaneCommandProcessor, LaneCommandSchemas } from './LaneCommandProcessor';

type PerLaneAction = MqttCommandActionOf<'competition-lane'>;

const ACTION_SCHEMAS: LaneCommandSchemas<PerLaneAction> = commandSchemasForScope(
  laneCommandSchemas,
  'competition-lane',
);

type PerLaneTopic = ParsedMqttTopicOf<'laneCompetitionCommand'>;

export interface PerLaneCommandHandlerDeps {
  mqttClient: IMqttClientService;
  processor: LaneCommandProcessor;
  commandBus: CommandBus;
  competitionRepository: ICompetitionRepository;
  assignmentPublisher: Pick<LaneAssignmentPublisher, 'assign'>;
  scorePublisher: Pick<LaneScorePublisher, 'publishCurrentScore'>;
  competitionStatePublisher: Pick<LaneCompetitionStatePublisher, 'publishCurrentState'>;
  interruptionControl: ICompetitionInterruptionControl;
  getLaneId: () => string;
  safetyStopControl: Pick<ILaneSafetyStopControl, 'isStopped' | 'getState'>;
  qualificationRecoveryControl: IQualificationRecoveryControl;
  qualificationRecoveryStatePublisher: Pick<QualificationRecoveryStatePublisher, 'publishCurrentState'>;
  qualificationRecoveryAdjudicationControl: IQualificationRecoveryAdjudicationControl;
  qualificationRecoverySettlementControl: IQualificationRecoverySettlementControl;
  malfunctionFiringControl: IMalfunctionFiringControl;
  reserveTransferControl: IReserveLaneTransferControl;
  replayTransferredSession: (competitionId: string) => Promise<void>;
}

export class PerLaneCommandHandler {
  private readonly subscription: TopicSubscription;

  constructor(private readonly deps: PerLaneCommandHandlerDeps) {
    this.subscription = new TopicSubscription(deps.mqttClient, {
      listenBeforeSubscribe: false,
      unsubscribeErrors: 'rethrow-while-connected',
    });
  }

  /**
   * Subscribes to lane-specific commands
   */
  async subscribeToCompetition(competitionId: string): Promise<void> {
    await this.unsubscribeFromCompetition();

    const topic = mqttTopicFilters.laneCompetitionCommands(competitionId, this.deps.getLaneId());
    await this.subscription.open(topic, (msgTopic, payload) => {
      const parsed = parseMqttTopic(msgTopic);
      if (parsed?.kind !== 'laneCompetitionCommand') return;
      if (parsed.laneId !== this.deps.getLaneId()) return;

      void this.handleCommand(parsed, payload);
    });
  }

  /**
   * Unsubscribes from the competition
   */
  async unsubscribeFromCompetition(): Promise<void> {
    await this.subscription.close();
  }

  /**
   * Processes a command
   */
  private handleCommand(parsed: PerLaneTopic, payload: Buffer): Promise<void> {
    return this.deps.processor.handle<PerLaneAction>({
      logContext: 'PerLaneCommandHandler',
      action: parsed.action,
      payload,
      schemas: ACTION_SCHEMAS,
      requiresReady: () => true,
      acknowledgementTopic: mqttTopics.laneCompetitionCommandAcknowledgement(
        parsed.competitionId,
        this.deps.getLaneId(),
        parsed.action,
      ),
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
      this.deps.reserveTransferControl.assertMutationAllowed();
    switch (action) {
      case 'reserve-lane-transfer': {
        const transfer = command.transfer as ReserveLaneTransferAction;
        const transferCompetitionId =
          transfer.operation === 'PREPARE_SOURCE'
            ? transfer.request.competitionId
            : 'bundle' in transfer
              ? transfer.bundle.request.competitionId
              : competitionId;
        if (transferCompetitionId !== competitionId) throw new Error('Transfer belongs to another competition');
        const bundle = await this.deps.reserveTransferControl.execute(competitionId, transfer);
        if (bundle.request.competitionId !== competitionId) throw new Error('Transfer belongs to another competition');
        if (transfer.operation === 'ACTIVATE_TARGET') await this.deps.replayTransferredSession(competitionId);
        await this.deps.competitionStatePublisher.publishCurrentState(competitionId);
        await this.deps.scorePublisher.publishCurrentScore(competitionId);
        return { bundle };
      }
      case 'start-malfunction-firing': {
        this.assertSafetyCleared(action);
        const request = command.request as MalfunctionFiringRequest;
        if (request.competitionId !== competitionId) throw new Error('Firing request has a different competition');
        return {
          evidence: MalfunctionFiringEvidenceSchema.parse(await this.deps.malfunctionFiringControl.start(request)),
        };
      }
      case 'read-malfunction-firing': {
        return {
          evidence: MalfunctionFiringEvidenceSchema.parse(
            this.deps.malfunctionFiringControl.read(competitionId, command.runId as string),
          ),
        };
      }
      case 'cancel-malfunction-firing': {
        return {
          evidence: MalfunctionFiringEvidenceSchema.parse(
            this.deps.malfunctionFiringControl.cancel(
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
        await this.deps.assignmentPublisher.assign(competitionId, athlete);
        return undefined;
      }

      case 'reset-session': {
        // ResetSession requires a sessionId. Retrieve CompetitionState from competitionId to resolve sessionId.
        const competition = await this.deps.competitionRepository.findById(competitionId);
        if (!competition) {
          throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { competitionId });
        }
        if (competition.phase !== 'IDLE') {
          throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
            detail: `reset-session is only allowed before competition start; current phase is ${competition.phase}`,
          });
        }
        await this.deps.commandBus.execute(ResetSessionToken, {
          sessionId: competition.sessionId,
        });
        // A successful reset acknowledgement guarantees that the broker no
        // longer retains the pre-reset score.
        await this.deps.scorePublisher.publishCurrentScore();
        return undefined;
      }

      case 'pause-timer': {
        const record = await this.deps.interruptionControl.pause({
          competitionId,
          interruptionId: command.interruptionId as string,
          pausedAt: new Date(command.pausedAt as string),
        });
        await this.deps.competitionStatePublisher.publishCurrentState(competitionId);
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
        const record = await this.deps.interruptionControl.resume({
          competitionId,
          interruptionId: command.interruptionId as string,
          timerStartAt: new Date(command.timerStartAt as string),
          authorizedRemainingSeconds: command.authorizedRemainingSeconds as number,
          unlimitedSightingShots: command.unlimitedSightingShots as boolean,
        });
        await this.deps.competitionStatePublisher.publishCurrentState(competitionId);
        return { interruptionId: record.interruptionId, status: record.status };
      }

      case 'resume-match': {
        this.assertSafetyCleared(action);
        const record = await this.deps.interruptionControl.resumeMatch({
          competitionId,
          interruptionId: command.interruptionId as string,
        });
        await this.deps.competitionStatePublisher.publishCurrentState(competitionId);
        return { interruptionId: record.interruptionId, status: record.status };
      }

      case 'start-qualification-recovery': {
        this.assertSafetyCleared(action);
        const control = this.deps.qualificationRecoveryControl;
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
        await this.deps.qualificationRecoveryStatePublisher.publishCurrentState(competitionId);
        return {
          runId: record.runId,
          sequenceId: record.sequenceId,
          status: record.status,
          recordedShots: record.shots.length,
        };
      }

      case 'cancel-qualification-recovery': {
        this.assertSafetyCleared(action);
        const control = this.deps.qualificationRecoveryControl;
        const current = control.get(command.runId as string);
        if (!current || current.competitionId !== competitionId) {
          throw new Error(`Qualification recovery run ${command.runId as string} does not belong to this competition`);
        }
        const record = control.cancel({ runId: current.runId, reason: command.reason as string });
        await this.deps.qualificationRecoveryStatePublisher.publishCurrentState(competitionId);
        return { runId: record.runId, sequenceId: record.sequenceId, status: record.status };
      }

      case 'apply-qualification-recovery': {
        const control = this.deps.qualificationRecoveryAdjudicationControl;
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
          this.deps.competitionStatePublisher.publishCurrentState(competitionId),
          this.deps.scorePublisher.publishCurrentScore(competitionId),
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
        const control = this.deps.qualificationRecoverySettlementControl;
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
          this.deps.competitionStatePublisher.publishCurrentState(competitionId),
          this.deps.scorePublisher.publishCurrentScore(competitionId),
        ]);
        return {
          settlementId: record.id,
          decisionId: record.decisionId,
          treatment: record.treatment,
          retainedShots: record.recordedShots.length,
        };
      }

      case 'retire-finalist': {
        const competition = await this.deps.competitionRepository.findById(competitionId);
        if (!competition) throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: competitionId });
        if (competition.config.name !== 'Final') {
          throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
            detail: `retire-finalist requires a Final; current round is ${competition.config.name}`,
          });
        }
        if (competition.phase !== 'FINISHED') {
          await this.deps.commandBus.execute(FinishCompetitionToken, { competitionId });
        }
        const finalSnapshotCommandId = command.commandId as string;
        await Promise.all([
          this.deps.competitionStatePublisher.publishCurrentState(competitionId, finalSnapshotCommandId),
          this.deps.scorePublisher.publishCurrentScore(competitionId, finalSnapshotCommandId),
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
    if (!this.deps.safetyStopControl.isStopped()) return;
    const safetyStopId = this.deps.safetyStopControl.getState()?.safetyStopId ?? 'unknown';
    throw new Error(`Safety stop ${safetyStopId} is active; ${action} is blocked`);
  }
}

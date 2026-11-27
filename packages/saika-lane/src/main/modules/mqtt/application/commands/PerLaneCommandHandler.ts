// SPDX-License-Identifier: MIT
/** Handles commands addressed to one Lane within a competition. */

import { commandSchemasForScope, type MqttCommandActionOf } from '@sasakiuri/saika-protocol/commands';
import { MalfunctionFiringEvidenceSchema } from '@sasakiuri/saika-protocol/MalfunctionFiring';
import { mqttTopicFilters, mqttTopics, parseMqttTopic, type ParsedMqttTopicOf } from '@sasakiuri/saika-protocol/topics';

import { FinishCompetitionToken, ResetSessionToken } from '@/main/composition/tokens';
import { requireCompetition } from '@/main/modules/competition/application/requireCompetition';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { IMalfunctionFiringControl } from '@/main/modules/malfunction-firing';
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
} from '@/main/modules/qualification-recovery';
import type { IReserveLaneTransferControl } from '@/main/modules/reserve-lane-transfer/domain/ReserveLaneTransfer';
import { assertSafetyStopCleared, type ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import { laneCommandTable, type LaneCommandProcessor, type ReceivedLaneCommandArgs } from './LaneCommandProcessor';
import { publishFinalSnapshots } from './publishFinalSnapshots';

interface PerLaneCommandPolicy {
  readonly requiresReady: true;
  /** The action may run while a reserve-lane transfer is pending. */
  readonly allowedDuringReserveTransfer: boolean;
  /** An active safety stop rejects the action. */
  readonly blockedWhileSafetyStopped: boolean;
}

const PER_LANE_POLICIES = {
  'reserve-lane-transfer': {
    requiresReady: true,
    allowedDuringReserveTransfer: true,
    blockedWhileSafetyStopped: false,
  },
  'start-malfunction-firing': {
    requiresReady: true,
    allowedDuringReserveTransfer: false,
    blockedWhileSafetyStopped: true,
  },
  'read-malfunction-firing': {
    requiresReady: true,
    allowedDuringReserveTransfer: true,
    blockedWhileSafetyStopped: false,
  },
  'cancel-malfunction-firing': {
    requiresReady: true,
    allowedDuringReserveTransfer: false,
    blockedWhileSafetyStopped: false,
  },
  'assign-athlete': { requiresReady: true, allowedDuringReserveTransfer: false, blockedWhileSafetyStopped: false },
  'reset-session': { requiresReady: true, allowedDuringReserveTransfer: false, blockedWhileSafetyStopped: false },
  'pause-timer': { requiresReady: true, allowedDuringReserveTransfer: false, blockedWhileSafetyStopped: false },
  'resume-timer': { requiresReady: true, allowedDuringReserveTransfer: false, blockedWhileSafetyStopped: true },
  'resume-match': { requiresReady: true, allowedDuringReserveTransfer: false, blockedWhileSafetyStopped: true },
  'start-qualification-recovery': {
    requiresReady: true,
    allowedDuringReserveTransfer: false,
    blockedWhileSafetyStopped: true,
  },
  'cancel-qualification-recovery': {
    requiresReady: true,
    allowedDuringReserveTransfer: false,
    blockedWhileSafetyStopped: true,
  },
  'apply-qualification-recovery': {
    requiresReady: true,
    allowedDuringReserveTransfer: false,
    blockedWhileSafetyStopped: false,
  },
  'settle-qualification-recovery': {
    requiresReady: true,
    allowedDuringReserveTransfer: false,
    blockedWhileSafetyStopped: false,
  },
  'retire-finalist': { requiresReady: true, allowedDuringReserveTransfer: false, blockedWhileSafetyStopped: false },
} as const satisfies Record<MqttCommandActionOf<'competition-lane'>, PerLaneCommandPolicy>;

export const PER_LANE_COMMANDS = laneCommandTable(
  commandSchemasForScope(laneCommandSchemas, 'competition-lane'),
  PER_LANE_POLICIES,
);

type ReceivedPerLaneCommand = ReceivedLaneCommandArgs<typeof PER_LANE_COMMANDS>;

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
    return this.deps.processor.handle({
      logContext: 'PerLaneCommandHandler',
      action: parsed.action,
      payload,
      commands: PER_LANE_COMMANDS,
      acknowledgementTopic: mqttTopics.laneCompetitionCommandAcknowledgement(
        parsed.competitionId,
        this.deps.getLaneId(),
        parsed.action,
      ),
      execute: (...received) => this.executeAction(received, parsed.competitionId),
    });
  }

  /**
   * Executes an action
   */
  private async executeAction(
    [action, command]: ReceivedPerLaneCommand,
    competitionId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const policy = PER_LANE_COMMANDS[action];
    if (!policy.allowedDuringReserveTransfer) this.deps.reserveTransferControl.assertMutationAllowed();
    if (policy.blockedWhileSafetyStopped) assertSafetyStopCleared(this.deps.safetyStopControl, action);
    switch (action) {
      case 'reserve-lane-transfer': {
        const transfer = command.transfer;
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
        const request = command.request;
        if (request.competitionId !== competitionId) throw new Error('Firing request has a different competition');
        return {
          evidence: MalfunctionFiringEvidenceSchema.parse(await this.deps.malfunctionFiringControl.start(request)),
        };
      }
      case 'read-malfunction-firing': {
        return {
          evidence: MalfunctionFiringEvidenceSchema.parse(
            this.deps.malfunctionFiringControl.read(competitionId, command.runId),
          ),
        };
      }
      case 'cancel-malfunction-firing': {
        return {
          evidence: MalfunctionFiringEvidenceSchema.parse(
            this.deps.malfunctionFiringControl.cancel(competitionId, command.runId, command.reason, command.request),
          ),
        };
      }
      case 'assign-athlete': {
        const athlete = command.athlete;
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
          interruptionId: command.interruptionId,
          pausedAt: new Date(command.pausedAt),
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
        const record = await this.deps.interruptionControl.resume({
          competitionId,
          interruptionId: command.interruptionId,
          timerStartAt: new Date(command.timerStartAt),
          authorizedRemainingSeconds: command.authorizedRemainingSeconds,
          unlimitedSightingShots: command.unlimitedSightingShots,
        });
        await this.deps.competitionStatePublisher.publishCurrentState(competitionId);
        return { interruptionId: record.interruptionId, status: record.status };
      }

      case 'resume-match': {
        const record = await this.deps.interruptionControl.resumeMatch({
          competitionId,
          interruptionId: command.interruptionId,
        });
        await this.deps.competitionStatePublisher.publishCurrentState(competitionId);
        return { interruptionId: record.interruptionId, status: record.status };
      }

      case 'start-qualification-recovery': {
        const control = this.deps.qualificationRecoveryControl;
        const record = await control.start({
          runId: command.runId,
          decisionId: command.decisionId,
          interruptionId: command.interruptionId,
          competitionId,
          stageIndex: command.stageIndex,
          seriesIndex: command.seriesIndex,
          expectedMatchProgramId: command.expectedMatchProgramId,
          expectedSeriesShotLimit: command.expectedSeriesShotLimit,
          expectedRecordedShots: command.expectedRecordedShots,
          authorization: command.authorization,
          loadAt: new Date(command.loadAt),
          officialName: command.officialName,
          decisionRuleReference: command.decisionRuleReference,
          decidedAt: new Date(command.decidedAt),
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
        const control = this.deps.qualificationRecoveryControl;
        const current = control.get(command.runId);
        if (!current || current.competitionId !== competitionId) {
          throw new Error(`Qualification recovery run ${command.runId} does not belong to this competition`);
        }
        const record = control.cancel({ runId: current.runId, reason: command.reason });
        await this.deps.qualificationRecoveryStatePublisher.publishCurrentState(competitionId);
        return { runId: record.runId, sequenceId: record.sequenceId, status: record.status };
      }

      case 'apply-qualification-recovery': {
        const control = this.deps.qualificationRecoveryAdjudicationControl;
        const current = control.get(command.runId);
        if (current && current.competitionId !== competitionId) {
          throw new Error(`Qualification recovery run ${command.runId} does not belong to this competition`);
        }
        const record = await control.apply({
          runId: command.runId,
          competitionId,
          appliedBy: command.appliedBy,
          statement: command.statement,
          appliedAt: new Date(command.appliedAt),
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
        const current = control.get(command.decisionId);
        if (current && current.competitionId !== competitionId) {
          throw new Error(`Qualification recovery decision ${command.decisionId} does not belong to this competition`);
        }
        const record = await control.apply({
          decisionId: command.decisionId,
          competitionId,
          interruptionId: command.interruptionId,
          treatment: command.treatment,
          stageIndex: command.stageIndex,
          seriesIndex: command.seriesIndex,
          expectedMatchProgramId: command.expectedMatchProgramId,
          expectedSeriesShotLimit: command.expectedSeriesShotLimit,
          expectedRecordedShots: command.expectedRecordedShots,
          decisionOfficialName: command.decisionOfficialName,
          decisionRuleReference: command.decisionRuleReference,
          decidedAt: new Date(command.decidedAt),
          appliedBy: command.appliedBy,
          statement: command.statement,
          appliedAt: new Date(command.appliedAt),
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
        const competition = await requireCompetition(this.deps.competitionRepository, competitionId);
        if (competition.config.name !== 'Final') {
          throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
            detail: `retire-finalist requires a Final; current round is ${competition.config.name}`,
          });
        }
        if (competition.phase !== 'FINISHED') {
          await this.deps.commandBus.execute(FinishCompetitionToken, { competitionId });
        }
        await publishFinalSnapshots(this.deps, competitionId, command.commandId);
        return {
          checkpointId: command.checkpointId,
          rank: command.rank,
          afterShot: command.afterShot,
        };
      }
    }
  }
}

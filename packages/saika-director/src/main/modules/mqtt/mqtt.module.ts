import { OperationalProfileService } from '@/main/modules/operational-profiles';
import { operationalProfilesContract } from '@/shared/ipc/contracts/operationalProfiles.contract';
// SPDX-License-Identifier: MIT
import { networkInterfaces } from 'node:os';

import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import { FinalFiringContextToken, FinalFiringTransportToken } from '@/main/modules/final-recovery-firing';
import {
  ApplyQualificationRecoverySettlementTransportToken,
  ApplyQualificationRecoveryTransportToken,
  CancelQualificationRecoveryTransportToken,
  StartQualificationRecoveryTransportToken,
  type StartQualificationRecoveryTransportInput,
} from '@/main/modules/range-interruptions';
import {
  ResumeReserveLaneToken,
  ResumeReserveMatchToken,
  TransferReserveLaneToken,
  ReserveTransferDataGuard,
  SqliteReserveTransferRepository,
} from '@/main/modules/reserve-lane-transfers';
import {
  PublishMqttFinalResultsToken,
  PublishMqttMixedTeamFinalResultsToken,
  PublishMqttResultsToken,
} from '@/main/modules/results';
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import type { ModuleDefinition, ModuleOutput } from '@/main/shared-infra/module/ModuleDefinition';
import { assertParticipantEligible } from '@/main/shared-infra/operations/ParticipantEligibility';
import type { CompetitionTypeDefinition, FiringWindowDetectionPolicy } from '@/shared/competitionTypes';
import { eventsContract, mqttContract, type MqttControlSnapshotDto } from '@/shared/ipc/contracts';
import type { PublishResultsResponse } from '@/shared/ipc/contracts/results.contract';
import { Logger } from '@/shared/utils/Logger';

import { executeFinalScriptStep } from './application/FinalScriptStepExecutor';
import { orderFinalShootOffLaneIds } from './application/FinalShootOffParticipantOrder';
import { FiringPointNumberResolver } from './application/FiringPointNumberResolver';
import { FiringWindowDetectionService } from './application/FiringWindowDetectionService';
import { assertPhaseStartReady } from './application/PhaseStartGuard';
import { toCompetitionShotObservation } from './application/toCompetitionShotObservation';
import { toFiringWindowViolationDto } from './application/toFiringWindowViolationDto';
import { ClockQualityPolicy, type ClockQualityAssessment } from './domain/ClockQualityPolicy';
import { embeddedMqttSecurityFromEnvironment } from './domain/EmbeddedMqttAccessPolicy';
import type {
  DebugLogEmitted,
  FiringWindowViolationDetected,
  LaneConnected,
  MqttConnectionError,
  MqttControlStateChanged,
  ShotObservationEvidenceObserved,
  ShotReceived,
} from './domain/events';
import { SAFETY_STOP_CLEARANCE_RULE_REFERENCES, SafetyStopClearancePolicy } from './domain/SafetyStopClearancePolicy';
import {
  DirectorMqttService,
  sanitizeBrokerUrl,
  type CommandBatchResult,
  type CompetitionResultLane,
  type MqttControlSnapshot,
} from './infra/DirectorMqttService';
import { EmbeddedMqttBroker } from './infra/EmbeddedMqttBroker';
import type { MqttCredentials } from './infra/MqttTransport';
import { SqliteMqttRetainedMessageStore } from './infra/SqliteMqttRetainedMessageStore';
import { SqliteSafetyStopAuditJournal } from './infra/SqliteSafetyStopAuditJournal';

const logger = Logger.create('mqtt.module');

function getLocalIpv4Addresses(): string[] {
  const addresses: string[] = [];
  for (const nets of Object.values(networkInterfaces())) {
    if (!nets) continue;
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
}

function getBrokerUrl(mode: 'embedded' | 'external', port: number, externalUrl: string): string {
  return mode === 'embedded' ? `mqtt://localhost:${port}` : externalUrl;
}

function mqttCredentialsFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): MqttCredentials | undefined {
  const username = environment.SAIKA_MQTT_DIRECTOR_USERNAME?.trim();
  const password = environment.SAIKA_MQTT_DIRECTOR_PASSWORD;
  if (!username && !password) return undefined;
  if (!username || !password) {
    throw new Error('MQTT credentials require both SAIKA_MQTT_DIRECTOR_USERNAME and SAIKA_MQTT_DIRECTOR_PASSWORD');
  }
  return { username, password };
}

/** Keeps the command issuer stable while allowing each installation to use a distinct trust identity. */
export function mqttDirectorIdFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  persistedDirectorId: string,
): string {
  const configured = environment.SAIKA_MQTT_DIRECTOR_ID;
  const directorId = (configured ?? persistedDirectorId).trim();
  if (!directorId) {
    throw new Error(
      configured === undefined
        ? 'Persisted MQTT Director ID must not be empty'
        : 'SAIKA_MQTT_DIRECTOR_ID must not be empty',
    );
  }
  return directorId;
}

interface RuntimeBrokerConfig {
  mode: 'embedded' | 'external';
  url: string;
  port: number;
}

function getLaneCompetitionMetadata(definition: CompetitionTypeDefinition): {
  discipline: string;
  acc: 'RING' | 'DECIMAL';
} {
  if (!definition.laneProtocol) {
    throw new Error(`Competition type ${definition.id} is not supported by the current Saika Lane MQTT API`);
  }
  return definition.laneProtocol;
}

function getNextSeriesTimer(
  definition: CompetitionTypeDefinition,
  stageIndex: number,
  seriesIndex: number,
): { durationSeconds: number; stageIndex: number; seriesIndex: number } | undefined {
  const sourceStage = definition.config.stages[stageIndex];
  if (!sourceStage?.series[seriesIndex]) throw new Error(`Series ${stageIndex}:${seriesIndex} is not configured`);
  const nextStageIndex = seriesIndex + 1 < sourceStage.series.length ? stageIndex : stageIndex + 1;
  const nextSeriesIndex = seriesIndex + 1 < sourceStage.series.length ? seriesIndex + 1 : 0;
  const nextStage = definition.config.stages[nextStageIndex];
  if (!nextStage?.series[nextSeriesIndex]) return undefined;
  if (nextStage.series[nextSeriesIndex]?.timedTargetProgramId) return undefined;
  if (nextStage.timer.mode === 'stage') return undefined;
  return { durationSeconds: nextStage.timer.durationSec, stageIndex: nextStageIndex, seriesIndex: nextSeriesIndex };
}

function getPreviousSeriesPosition(
  definition: CompetitionTypeDefinition,
  target: { stageIndex: number; seriesIndex: number },
): { stageIndex: number; seriesIndex: number } | null {
  const targetStage = definition.config.stages[target.stageIndex];
  if (!targetStage?.series[target.seriesIndex] || targetStage.type !== 'match') {
    throw new Error(`Final script target ${target.stageIndex}:${target.seriesIndex} is not configured`);
  }
  const firstMatchStageIndex = definition.config.stages.findIndex((stage) => stage.type === 'match');
  if (target.stageIndex === firstMatchStageIndex && target.seriesIndex === 0) return null;
  if (target.seriesIndex > 0) return { stageIndex: target.stageIndex, seriesIndex: target.seriesIndex - 1 };

  for (let stageIndex = target.stageIndex - 1; stageIndex >= firstMatchStageIndex; stageIndex -= 1) {
    const stage = definition.config.stages[stageIndex];
    if (stage?.type === 'match' && stage.series.length > 0) {
      return { stageIndex, seriesIndex: stage.series.length - 1 };
    }
  }
  throw new Error(`Final script target ${target.stageIndex}:${target.seriesIndex} has no preceding MATCH series`);
}

function assertCommandSucceeded(
  result: { success: boolean; lanes: readonly { laneId: string; status: string }[] },
  action: string,
): void {
  if (result.success) return;
  const failed = result.lanes.filter((lane) => lane.status !== 'done').map((lane) => lane.laneId);
  throw new Error(`${action} did not complete on Lane(s): ${failed.join(', ') || 'unknown'}`);
}

export const mqttModule: ModuleDefinition<
  | 'relayReadinessService'
  | 'estInspectionStartService'
  | 'competitionStartReadiness'
  | 'database'
  | 'eventBus'
  | 'commandBus'
  | 'queryBus'
  | 'ipcRouter'
  | 'debugLogStore'
  | 'appConfigService'
  | 'competitionTypeRegistry'
  | 'laneControlRepository'
  | 'competitionShotJournal'
  | 'firingWindowJournal'
  | 'shotObservationEvidenceJournal'
  | 'competitionDataGuard'
  | 'finalOperationService'
  | 'finalResultDeclarationService'
  | 'participantEligibilityReader'
> = {
  name: 'mqtt',
  deps: [
    'relayReadinessService',
    'estInspectionStartService',
    'competitionStartReadiness',
    'database',
    'eventBus',
    'commandBus',
    'queryBus',
    'ipcRouter',
    'debugLogStore',
    'appConfigService',
    'competitionTypeRegistry',
    'laneControlRepository',
    'competitionShotJournal',
    'firingWindowJournal',
    'shotObservationEvidenceJournal',
    'competitionDataGuard',
    'finalOperationService',
    'finalResultDeclarationService',
    'participantEligibilityReader',
  ] as const,
  register(ctx): ModuleOutput {
    const {
      database,
      eventBus,
      commandBus,
      queryBus,
      ipcRouter,
      debugLogStore,
      appConfigService,
      competitionTypeRegistry,
      laneControlRepository,
      competitionShotJournal,
      firingWindowJournal,
      shotObservationEvidenceJournal,
      competitionDataGuard,
      finalOperationService,
      finalResultDeclarationService,
      participantEligibilityReader,
    } = ctx;

    const retainedMessageStore = new SqliteMqttRetainedMessageStore(database);
    const safetyStopAuditJournal = new SqliteSafetyStopAuditJournal(database);
    const safetyStopClearancePolicy = new SafetyStopClearancePolicy();
    const embeddedBrokerSecurity = embeddedMqttSecurityFromEnvironment(process.env);
    const directorMqttCredentials = mqttCredentialsFromEnvironment(process.env);
    let embeddedMqttBroker = new EmbeddedMqttBroker(
      { port: appConfigService.get('mqtt.broker.port'), security: embeddedBrokerSecurity },
      retainedMessageStore,
    );
    const firingPointNumberResolver = new FiringPointNumberResolver();
    const announcedChannelByLaneId = new Map<string, number>();
    const competitionTypeIdByCompetitionId = new Map<string, string>();

    const getFiringWindowPolicy = (competitionId: string): FiringWindowDetectionPolicy | undefined => {
      const competitionTypeId = competitionTypeIdByCompetitionId.get(competitionId);
      if (!competitionTypeId) return undefined;
      try {
        return competitionTypeRegistry.get(competitionTypeId).firingWindowDetection;
      } catch (error) {
        logger.error(`Failed to resolve firing-window policy for ${competitionId}:`, error);
        return undefined;
      }
    };

    const firingWindowDetectionService = new FiringWindowDetectionService(competitionShotJournal, firingWindowJournal, {
      onViolationDetected: (violation) => {
        eventBus.emit({
          type: 'FiringWindowViolationDetected',
          timestamp: violation.detectedAt.getTime(),
          violation,
        });
      },
    });

    const addDebugLog = (message: string): void => {
      const entry = {
        timestamp: Date.now(),
        direction: 'LOG' as const,
        raw: message,
      };
      debugLogStore.addEntry(entry);
      eventBus.emit({
        type: 'DebugLogEmitted',
        ...entry,
      });
    };

    const toControlSnapshotDto = (snapshot: MqttControlSnapshot): MqttControlSnapshotDto => {
      // An offline retained Lane must not reserve a firing-point number forever.
      // A replacement Lane with the same alias can then claim the intended
      // number while the offline entry remains visible for diagnostics.
      for (const lane of snapshot.lanes) {
        if (lane.hardware?.connection.status === 'offline') firingPointNumberResolver.forget(lane.laneId);
      }

      // Settle mappings first: resolving an explicit alias can displace a
      // fallback mapping that appeared earlier in the snapshot.
      for (const lane of snapshot.lanes) {
        if (lane.hardware !== null && lane.hardware.connection.status !== 'offline') {
          firingPointNumberResolver.resolve(lane.laneId, lane.laneAlias);
        }
      }

      return {
        ...snapshot,
        lanes: snapshot.lanes.map((lane) => ({
          ...lane,
          firingPointNumber:
            lane.hardware === null || lane.hardware.connection.status === 'offline'
              ? null
              : firingPointNumberResolver.resolve(lane.laneId, lane.laneAlias),
        })),
      };
    };

    const handleSnapshot = (snapshot: MqttControlSnapshot): void => {
      const controlSnapshot = toControlSnapshotDto(snapshot);
      for (const competition of controlSnapshot.competitions) {
        const previousTypeId = competitionTypeIdByCompetitionId.get(competition.competitionId);
        competitionTypeIdByCompetitionId.set(competition.competitionId, competition.competitionTypeId);
        if (previousTypeId !== competition.competitionTypeId) {
          try {
            firingWindowDetectionService.reconcileCompetition(
              competition.competitionId,
              getFiringWindowPolicy(competition.competitionId),
            );
          } catch (error) {
            logger.error(`Failed to reconcile firing-window evidence for ${competition.competitionId}:`, error);
          }
        }
      }
      for (const lane of controlSnapshot.lanes) {
        if (lane.hardware?.connection.status !== 'connected') continue;
        const channel = lane.firingPointNumber;
        if (channel === null || announcedChannelByLaneId.get(lane.laneId) === channel) continue;
        announcedChannelByLaneId.set(lane.laneId, channel);
        eventBus.emit({
          type: 'LaneConnected',
          timestamp: Date.now(),
          laneId: lane.laneId,
          channel,
        });
      }

      eventBus.emit({
        type: 'MqttControlStateChanged',
        timestamp: Date.now(),
        snapshot: controlSnapshot,
      });
    };

    const readClockQualitySettings = () => ({
      mode: appConfigService.get('clockQuality.mode'),
      maxAbsoluteOffsetMilliseconds: appConfigService.get('clockQuality.maxAbsoluteOffsetMilliseconds'),
      maxUncertaintyMilliseconds: appConfigService.get('clockQuality.maxUncertaintyMilliseconds'),
      maxSampleAgeMilliseconds: appConfigService.get('clockQuality.maxSampleAgeMilliseconds'),
    });
    const mqttService = new DirectorMqttService(
      {
        directorId: mqttDirectorIdFromEnvironment(process.env, appConfigService.get('mqtt.director.id')),
        commandTimeoutMs: appConfigService.get('mqtt.commandTimeoutMs'),
        startDelayMs: appConfigService.get('mqtt.startDelayMs'),
        ...(directorMqttCredentials ? { credentials: directorMqttCredentials } : {}),
      },
      {
        assertPhaseStartAllowed: (scope) => ctx.competitionStartReadiness.assertAllowed(scope),
        assertCompetitionFinishAllowed: (competitionId) =>
          new ReserveTransferDataGuard(new SqliteReserveTransferRepository(database)).assertAllowed({
            competitionId,
            operation: 'CLEAR_COMPETITION_DATA',
          }),
        onStateChanged: handleSnapshot,
        onCompetitionShotObserved: (shot, payloadJson) => {
          try {
            const observation = toCompetitionShotObservation(shot, payloadJson, new Date());
            competitionShotJournal.append(observation);
            firingWindowDetectionService.observe(observation, getFiringWindowPolicy(observation.competitionId));
          } catch (error) {
            logger.error(`Failed to journal MQTT shot ${shot.shotId}:`, error);
          }
        },
        onCompetitionShootOffShotObserved: (shot) => {
          try {
            finalOperationService.observeShootOffShot({
              runId: shot.runId,
              competitionId: shot.competitionId,
              iteration: shot.iteration,
              laneId: shot.laneId,
              shotId: shot.shotId,
              scoreX10: shot.effectiveScoreX10,
              x: shot.x,
              y: shot.y,
              firedAt: shot.firedAt,
            });
          } catch (error) {
            logger.error(`Failed to record Final shoot-off shot ${shot.shotId}:`, error);
          }
        },
        onQualificationRecoveryStateObserved: (state, payloadJson) => {
          const observedAt = new Date();
          eventBus.emit({
            type: 'QualificationRecoveryStateObserved',
            timestamp: observedAt.getTime(),
            state,
            payloadJson,
            observedAt,
          });
        },
        onQualificationRecoveryShotObserved: (shot, payloadJson) => {
          const observedAt = new Date();
          eventBus.emit({
            type: 'QualificationRecoveryShotObserved',
            timestamp: observedAt.getTime(),
            shot,
            payloadJson,
            observedAt,
          });
        },
        onShotObservationEvidenceObserved: (evidence, payloadJson) => {
          try {
            const observedAt = new Date();
            shotObservationEvidenceJournal.append({ evidence, payloadJson, observedAt });
            eventBus.emit({
              type: 'ShotObservationEvidenceObserved',
              timestamp: observedAt.getTime(),
              evidence,
              observedAt,
            });
          } catch (error) {
            logger.error(`Failed to journal shot observation evidence ${evidence.evidenceId}:`, error);
          }
        },
        onFiringBoundary: (boundary) => {
          try {
            firingWindowDetectionService.recordBoundary(boundary, getFiringWindowPolicy(boundary.competitionId));
          } catch (error) {
            logger.error(`Failed to journal ${boundary.sourceAction} firing boundary:`, error);
          }
        },
        onCompetitionShot: (shot) => {
          const lane = mqttService.getSnapshot().lanes.find((entry) => entry.laneId === shot.laneId);
          if (!lane?.hardware) return;
          const channel = firingPointNumberResolver.resolve(shot.laneId, lane.laneAlias);
          if (channel === null) return;
          const localLane = laneControlRepository.findByChannel(channel);
          const shotNumber = (localLane?.lastReceivedShotNumber ?? 0) + 1;
          eventBus.emit({
            type: 'ShotReceived',
            timestamp: Date.now(),
            competitionId: shot.competitionId,
            channel,
            shotNumber,
            score: (shot.effectiveScoreX10 ?? shot.rawScoreX10) / 10,
            seriesNumber: shot.seriesIndex + 1,
          });
        },
        onDebugLog: addDebugLog,
        onSessionReset: () => {
          firingPointNumberResolver.reset();
          announcedChannelByLaneId.clear();
          competitionTypeIdByCompetitionId.clear();
        },
        onError: (message) => {
          eventBus.emit({
            type: 'MqttConnectionError',
            timestamp: Date.now(),
            message,
          });
        },
      },
      undefined,
      new ClockQualityPolicy(readClockQualitySettings()),
    );
    commandBus.register(FinalFiringContextToken, async ({ competitionId, laneId }) =>
      mqttService.getFinalFiringContext(competitionId, laneId),
    );
    commandBus.register(FinalFiringTransportToken, (input) => mqttService.executeFinalFiring(input));
    commandBus.register(TransferReserveLaneToken, (input) => mqttService.transferReserveLane(input));
    commandBus.register(ResumeReserveLaneToken, async (input) => {
      const result = await mqttService.resumeLaneTimer(
        input.competitionId,
        input.laneId,
        input.transferId,
        input.grant.remainingSeconds,
        input.grant.unlimitedSightingShots,
      );
      if (!result.success) throw new Error(result.lanes[0]?.error?.message ?? 'Lane resume was not acknowledged');
    });
    commandBus.register(ResumeReserveMatchToken, async (input) => {
      const result = await mqttService.resumeLaneMatch(input.competitionId, input.laneId, input.transferId);
      if (!result.success) throw new Error(result.lanes[0]?.error?.message ?? 'MATCH resume was not acknowledged');
    });

    const requireCompetition = (competitionId: string) => {
      const competition = mqttService.getSnapshot().competitions.find((state) => state.competitionId === competitionId);
      if (!competition) throw new Error(`Competition not found: ${competitionId}`);
      return competition;
    };

    const readBrokerConfig = (): RuntimeBrokerConfig => ({
      mode: appConfigService.get('mqtt.broker.mode'),
      url: appConfigService.get('mqtt.broker.url'),
      port: appConfigService.get('mqtt.broker.port'),
    });

    let runtimeTransitionTail = Promise.resolve();
    const activeControlOperations = new Set<Promise<void>>();
    const runWithRuntimeLock = <T>(operation: () => Promise<T>): Promise<T> => {
      // Capture only operations requested before this transition. Operations
      // requested later wait on the new transition tail instead, avoiding a
      // reader/writer deadlock while preserving parallel competition control.
      const precedingControlOperations = [...activeControlOperations];
      const result = runtimeTransitionTail.then(async () => {
        await Promise.all(precedingControlOperations);
        return operation();
      });
      runtimeTransitionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    };
    const runWithControlLock = <T>(operation: () => Promise<T>): Promise<T> => {
      const result = runtimeTransitionTail.then(operation);
      const tail = result.then(
        () => undefined,
        () => undefined,
      );
      activeControlOperations.add(tail);
      void tail.then(() => activeControlOperations.delete(tail));
      return result;
    };

    const assertQualificationRecoveryPosition = (input: {
      competitionId: string;
      stageIndex: number;
      seriesIndex: number;
      expectedMatchProgramId: string;
      expectedSeriesShotLimit: number;
    }): void => {
      const competition = requireCompetition(input.competitionId);
      const definition = competitionTypeRegistry.get(competition.competitionTypeId);
      if (competition.roundName !== 'Qualification' || definition.config.name !== 'Qualification') {
        throw new Error('Qualification recovery requires a Qualification competition');
      }
      if (definition.timedTarget?.recovery.procedure !== 'QUALIFICATION') {
        throw new Error(`Competition type ${definition.id} has no Qualification recovery capability`);
      }
      const stage = definition.config.stages[input.stageIndex];
      const series = stage?.series[input.seriesIndex];
      if (!stage || !series || stage.type !== 'match') {
        throw new Error(`Qualification recovery position ${input.stageIndex}:${input.seriesIndex} is not configured`);
      }
      if (series.timedTargetProgramId !== input.expectedMatchProgramId) {
        throw new Error(
          `Recovery program ${input.expectedMatchProgramId} does not match ${input.stageIndex}:${input.seriesIndex}`,
        );
      }
      if (series.shots !== input.expectedSeriesShotLimit) {
        throw new Error(
          `Recovery shot limit ${input.expectedSeriesShotLimit} does not match ${input.stageIndex}:${input.seriesIndex}`,
        );
      }
    };

    const startQualificationRecovery = async (input: StartQualificationRecoveryTransportInput) => {
      assertQualificationRecoveryPosition(input);
      const result = await mqttService.startQualificationRecovery(input);
      return { ...result, action: 'start-qualification-recovery' as const };
    };

    commandBus.register(StartQualificationRecoveryTransportToken, (input) =>
      runWithControlLock(() => startQualificationRecovery(input)),
    );
    commandBus.register(CancelQualificationRecoveryTransportToken, async (input) => {
      const result = await runWithControlLock(() => mqttService.cancelQualificationRecovery(input));
      return { ...result, action: 'cancel-qualification-recovery' as const };
    });
    commandBus.register(ApplyQualificationRecoveryTransportToken, async (input) => {
      const result = await runWithControlLock(() => mqttService.applyQualificationRecovery(input));
      return { ...result, action: 'apply-qualification-recovery' as const };
    });
    commandBus.register(ApplyQualificationRecoverySettlementTransportToken, async (input) => {
      const result = await runWithControlLock(() => {
        assertQualificationRecoveryPosition(input);
        if (input.expectedRecordedShots !== input.expectedSeriesShotLimit) {
          throw new Error('KEEP_RECORDED_SERIES requires every series shot to be recorded');
        }
        return mqttService.settleQualificationRecovery(input);
      });
      return { ...result, action: 'settle-qualification-recovery' as const };
    });

    const connectClient = async (config: RuntimeBrokerConfig): Promise<void> => {
      await mqttService.disconnect();
      await mqttService.connect(getBrokerUrl(config.mode, config.port, config.url));
    };

    const transitionRuntime = async (config: RuntimeBrokerConfig): Promise<void> => {
      await mqttService.disconnect();

      if (embeddedMqttBroker.running && (config.mode === 'external' || embeddedMqttBroker.port !== config.port)) {
        await embeddedMqttBroker.stop();
      }
      if (!embeddedMqttBroker.running && embeddedMqttBroker.port !== config.port) {
        embeddedMqttBroker = new EmbeddedMqttBroker(
          { port: config.port, security: embeddedBrokerSecurity },
          retainedMessageStore,
        );
      }
      if (config.mode === 'embedded' && !embeddedMqttBroker.running) {
        await embeddedMqttBroker.start();
      }

      await mqttService.connect(getBrokerUrl(config.mode, config.port, config.url));
    };

    const reconnectClient = async (): Promise<void> => {
      await connectClient(readBrokerConfig());
    };

    const operationalProfiles = new OperationalProfileService(
      [
        {
          id: 'relay',
          label: 'Relay readiness',
          scope: 'COMPETITION',
          read: (competitionId) => {
            const value = ctx.relayReadinessService.getStartSettings(competitionId);
            return { mode: value.mode, context: JSON.stringify(value) };
          },
          write: (competitionId, mode) => {
            ctx.relayReadinessService.setStartSettings({
              ...ctx.relayReadinessService.getStartSettings(competitionId),
              mode,
            });
          },
        },
        {
          id: 'inspection',
          label: 'EST inspection',
          scope: 'COMPETITION',
          read: (competitionId) => {
            const value = ctx.estInspectionStartService.getSettings(competitionId);
            return { mode: value.mode, context: JSON.stringify(value) };
          },
          write: (competitionId, mode) => {
            ctx.estInspectionStartService.saveSettings({
              ...ctx.estInspectionStartService.getSettings(competitionId),
              mode,
            });
          },
        },
        {
          id: 'clock',
          label: 'Clock quality',
          scope: 'DIRECTOR',
          read: () => ({ mode: readClockQualitySettings().mode, context: JSON.stringify(readClockQualitySettings()) }),
          write: (_competitionId, mode) => {
            if (
              mqttService
                .getSnapshot()
                .competitions.some((competition) => !['NOT_STARTED', 'MATCH_COMPLETE'].includes(competition.phase))
            )
              throw new Error('Finish active competitions before changing the shared clock policy');
            const settings = { ...readClockQualitySettings(), mode };
            const policy = new ClockQualityPolicy(settings);
            appConfigService.set('clockQuality.mode', mode);
            mqttService.setClockQualityPolicy(policy);
          },
        },
      ],
      (competitionId) => {
        const competition = mqttService.getSnapshot().competitions.find((item) => item.competitionId === competitionId);
        if (!competition || competition.phase !== 'NOT_STARTED')
          throw new Error('Select a competition that has not started before applying an operational profile');
      },
    );
    ipcRouter.register(operationalProfilesContract, {
      preview: (input) => operationalProfiles.preview(input),
      apply: (input) => runWithControlLock(() => operationalProfiles.apply(input)),
    });

    ipcRouter.register(mqttContract, {
      getBrokerConfig: () => runWithRuntimeLock(async () => readBrokerConfig()),
      setBrokerConfig: (input) =>
        runWithRuntimeLock(async () => {
          const previous = readBrokerConfig();
          const next: RuntimeBrokerConfig = {
            ...previous,
            mode: input.mode,
            ...(input.url === undefined ? {} : { url: input.url }),
            ...(input.port === undefined ? {} : { port: input.port }),
          };

          try {
            await transitionRuntime(next);
            appConfigService.setMany({
              'mqtt.broker.mode': next.mode,
              'mqtt.broker.url': next.url,
              'mqtt.broker.port': next.port,
            });
          } catch (error) {
            try {
              await transitionRuntime(previous);
            } catch (rollbackError) {
              logger.logError('Failed to restore the previous MQTT broker configuration', rollbackError);
            }
            throw error;
          }

          logger.info('Broker config updated', { mode: next.mode });
          return { success: true };
        }),
      getBrokerStatus: () =>
        runWithRuntimeLock(async () => ({
          brokerRunning: embeddedMqttBroker.running,
          clientConnected: mqttService.getSnapshot().connected,
          brokerPort: embeddedMqttBroker.port,
          localAddresses: getLocalIpv4Addresses(),
        })),
      startBroker: () => runWithRuntimeLock(() => embeddedMqttBroker.start()),
      stopBroker: () =>
        runWithRuntimeLock(async () => {
          if (mqttService.getSnapshot().connected) await mqttService.disconnect();
          await embeddedMqttBroker.stop();
        }),
      connect: () => runWithRuntimeLock(reconnectClient),
      disconnect: () => runWithRuntimeLock(() => mqttService.disconnect()),
      getControlState: async () => toControlSnapshotDto(mqttService.getSnapshot()),
      getFiringWindowViolations: async (input) =>
        firingWindowJournal.findViolationsByCompetition(input.competitionId).map(toFiringWindowViolationDto),
      getShotObservationEvidence: async (input) =>
        shotObservationEvidenceJournal.findByCompetition(input.competitionId).map((record) => ({
          ...record.evidence,
          observedAt: record.observedAt.toISOString(),
        })),
      getClockQualitySettings: async () => readClockQualitySettings(),
      setClockQualitySettings: (input) =>
        runWithControlLock(async () => {
          const policy = new ClockQualityPolicy(input);
          appConfigService.setMany({
            'clockQuality.mode': input.mode,
            'clockQuality.maxAbsoluteOffsetMilliseconds': input.maxAbsoluteOffsetMilliseconds,
            'clockQuality.maxUncertaintyMilliseconds': input.maxUncertaintyMilliseconds,
            'clockQuality.maxSampleAgeMilliseconds': input.maxSampleAgeMilliseconds,
          });
          mqttService.setClockQualityPolicy(policy);
          return readClockQualitySettings();
        }),
      getClockQuality: async () => mqttService.getClockQuality() as Record<string, ClockQualityAssessment>,
      getSafetyStopAudit: async (input) =>
        safetyStopAuditJournal.find(input.safetyStopId).map((entry) => ({
          ...entry,
          targetLaneIds: [...entry.targetLaneIds],
          occurredAt: entry.occurredAt.toISOString(),
          recordedAt: entry.recordedAt.toISOString(),
          laneOutcomes: entry.laneOutcomes.map((outcome) => ({
            ...outcome,
            acknowledgedAt: outcome.acknowledgedAt?.toISOString() ?? null,
          })),
          laneClearances: entry.laneClearances.map((clearance) => ({
            ...clearance,
            verifiedAt: clearance.verifiedAt.toISOString(),
            recordedAt: clearance.recordedAt.toISOString(),
            ruleReferences: [...clearance.ruleReferences],
          })),
        })),
      probeLaneClock: (input) => runWithControlLock(() => mqttService.probeLaneClock(input.laneId)),
      activateSafetyStop: (input) =>
        runWithControlLock(async () => {
          const occurredAt = new Date();
          const result = await mqttService.activateSafetyStop(
            input.laneIds,
            input.safetyStopId,
            input.reason,
            input.officialName,
          );
          safetyStopAuditJournal.append({
            id: crypto.randomUUID(),
            safetyStopId: input.safetyStopId,
            operation: 'ACTIVATE',
            targetLaneIds: [...new Set(input.laneIds)],
            success: result.success,
            reason: input.reason,
            officialName: input.officialName,
            occurredAt,
            recordedAt: new Date(),
            laneOutcomes: toSafetyLaneOutcomes(result),
            laneClearances: [],
          });
          return result;
        }),
      clearSafetyStop: (input) =>
        runWithControlLock(async () => {
          safetyStopClearancePolicy.validate(input, mqttService.getSnapshot());
          const occurredAt = new Date();
          const targetLaneIds = input.laneClearances.map((clearance) => clearance.laneId);
          const result = await mqttService.clearSafetyStop(
            targetLaneIds,
            input.safetyStopId,
            input.clearanceReason,
            input.officialName,
          );
          const recordedAt = new Date();
          safetyStopAuditJournal.append({
            id: crypto.randomUUID(),
            safetyStopId: input.safetyStopId,
            operation: 'CLEAR',
            targetLaneIds,
            success: result.success,
            reason: input.clearanceReason,
            officialName: input.officialName,
            occurredAt,
            recordedAt,
            laneOutcomes: toSafetyLaneOutcomes(result),
            laneClearances: input.laneClearances.map((clearance) => ({
              id: crypto.randomUUID(),
              laneId: clearance.laneId,
              participantId: clearance.participantId,
              participantName: clearance.participantName,
              athleteConfirmationStatus: clearance.athleteConfirmation.status,
              athleteConfirmedBy:
                clearance.athleteConfirmation.status === 'CONFIRMED' ? clearance.athleteConfirmation.confirmedBy : null,
              notApplicableReason:
                clearance.athleteConfirmation.status === 'NOT_APPLICABLE' ? clearance.athleteConfirmation.reason : null,
              firearmCondition: clearance.firearmCondition,
              personnelClear: true,
              verifiedBy: clearance.verifiedBy,
              verificationNote: clearance.verificationNote ?? null,
              verifiedAt: occurredAt,
              recordedAt,
              ruleReferences: SAFETY_STOP_CLEARANCE_RULE_REFERENCES,
            })),
          });
          return result;
        }),
      createCompetition: (input) =>
        runWithControlLock(async () => {
          const definition = competitionTypeRegistry.get(input.competitionTypeId);
          const metadata = getLaneCompetitionMetadata(definition);
          const matchStage = definition.config.stages.find((stage) => stage.type === 'match');
          const shotsPerSeries = matchStage?.series[0]?.shots ?? 0;
          if (!matchStage || shotsPerSeries <= 0) {
            throw new Error(`Competition type ${definition.id} has no MQTT-compatible match stage`);
          }
          return mqttService.createCompetition({
            competitionTypeId: definition.id,
            competitionTypeName: definition.name,
            discipline: metadata.discipline,
            roundName: definition.config.name,
            competitionUnit: definition.teamFormat === 'MIXED_PAIR' ? 'MIXED_TEAM' : 'INDIVIDUAL',
            definitionBinding: {
              protocolVersion: 1,
              compatibilityMode:
                definition.compatibilityMode ?? (definition.rulePackIdentity ? 'REQUIRED' : 'ADVISORY'),
              ...(definition.rulePackIdentity ? { rulePack: definition.rulePackIdentity } : {}),
            },
            acc: metadata.acc,
            shotsPerSeries,
            totalSeries: definition.resultFormat.totalSeries,
            totalShots: definition.resultFormat.totalShots,
            // joinCompetition publishes the provisional membership immediately
            // before issuing Lane commands. Keep creation itself recoverable if
            // the renderer exits between the two IPC calls.
            laneIds: [],
          });
        }),
      joinCompetition: (input) =>
        runWithControlLock(() => mqttService.joinCompetition(input.competitionId, input.laneIds)),
      leaveCompetition: (input) =>
        runWithControlLock(async () => {
          for (const laneId of input.laneIds) {
            competitionDataGuard.assertAllowed({ operation: 'LEAVE_LANE', competitionId: input.competitionId, laneId });
          }
          return mqttService.leaveCompetition(input.competitionId, input.laneIds);
        }),
      assignAthlete: (input) =>
        runWithControlLock(() => {
          if (input.athlete && !input.athlete.id.startsWith('manual-')) {
            assertParticipantEligible(participantEligibilityReader, input.athlete.id);
          }
          return mqttService.assignAthlete(input.competitionId, input.laneId, input.athlete);
        }),
      resetSession: (input) =>
        runWithControlLock(() => {
          competitionDataGuard.assertAllowed({
            operation: 'RESET_LANE_SESSION',
            competitionId: input.competitionId,
            laneId: input.laneId,
          });
          return mqttService.resetSession(input.competitionId, input.laneId, input.reason);
        }),
      pauseLaneTimer: (input) =>
        runWithControlLock(() => mqttService.pauseLaneTimer(input.competitionId, input.laneId, input.interruptionId)),
      resumeLaneTimer: (input) =>
        runWithControlLock(() =>
          mqttService.resumeLaneTimer(
            input.competitionId,
            input.laneId,
            input.interruptionId,
            input.authorizedRemainingSeconds,
            input.unlimitedSightingShots,
          ),
        ),
      resumeLaneMatch: (input) =>
        runWithControlLock(() => mqttService.resumeLaneMatch(input.competitionId, input.laneId, input.interruptionId)),
      pauseRangeTimers: (input) =>
        runWithControlLock(() =>
          mqttService.pauseRangeTimers(input.competitionId, input.laneIds, input.interruptionId),
        ),
      resumeRangeTimers: (input) =>
        runWithControlLock(() =>
          mqttService.resumeRangeTimers(
            input.competitionId,
            input.laneIds,
            input.interruptionId,
            input.authorizedRemainingSeconds,
            input.unlimitedSightingShots,
          ),
        ),
      resumeRangeMatch: (input) =>
        runWithControlLock(() =>
          mqttService.resumeRangeMatch(input.competitionId, input.laneIds, input.interruptionId),
        ),
      startSighting: (input) =>
        runWithControlLock(() => {
          const competition = requireCompetition(input.competitionId);
          if (competition.phase === 'NOT_STARTED') {
            assertPhaseStartReady(
              competitionTypeRegistry.get(competition.competitionTypeId),
              'SIGHTING',
              input.acknowledgedRequirementIds,
            );
          }
          return mqttService.startSighting(input.competitionId, input.durationSeconds, input.targetLaneIds);
        }),
      endSighting: (input) => runWithControlLock(() => mqttService.endSighting(input.competitionId)),
      startMatch: (input) =>
        runWithControlLock(() => {
          const competition = requireCompetition(input.competitionId);
          const definition = competitionTypeRegistry.get(competition.competitionTypeId);
          if (definition.timedTarget && input.durationSeconds !== undefined) {
            throw new Error(`Timed-target competition ${definition.id} must not use a generic MATCH timer`);
          }
          if (!definition.timedTarget && input.durationSeconds === undefined) {
            throw new Error(`Competition type ${definition.id} requires a generic MATCH timer duration`);
          }
          if (competition.phase === 'SIGHTING_COMPLETE') {
            assertPhaseStartReady(definition, 'MATCH', input.acknowledgedRequirementIds);
          }
          return mqttService.startMatch(input.competitionId, input.durationSeconds);
        }),
      startTimedTarget: (input) =>
        runWithControlLock(() => {
          const competition = requireCompetition(input.competitionId);
          const definition = competitionTypeRegistry.get(competition.competitionTypeId);
          if (!definition.timedTarget) throw new Error(`Competition type ${definition.id} has no timed target program`);
          const stage = definition.config.stages[input.stageIndex];
          const series = stage?.series[input.seriesIndex];
          if (!stage || !series || stage.type !== 'match') {
            throw new Error(`Timed target position ${input.stageIndex}:${input.seriesIndex} is not configured`);
          }
          const expectedProgramId =
            input.purpose === 'SIGHTING' ? stage.sightingTimedTargetProgramId : series.timedTargetProgramId;
          if (expectedProgramId !== input.programId) {
            throw new Error(
              `Timed target program ${input.programId} does not match ${input.purpose} at ${input.stageIndex}:${input.seriesIndex}`,
            );
          }
          const program = definition.timedTarget.programs.find((candidate) => candidate.id === input.programId);
          if (!program || program.purpose !== input.purpose) {
            throw new Error(`Timed target program ${input.programId} is not available for ${input.purpose}`);
          }
          return mqttService.startTimedTarget(input);
        }),
      recordTimedTargetUnload: (input) => runWithControlLock(() => mqttService.recordTimedTargetUnload(input)),
      cancelTimedTarget: (input) => runWithControlLock(() => mqttService.cancelTimedTarget(input)),
      executeFinalScriptStep: (input) =>
        runWithControlLock(() => {
          const authorization = finalOperationService.assertExecutionAuthorized({
            competitionId: input.competitionId,
            runId: input.runId,
            confirmationEntryId: input.confirmationEntryId,
            branch: input.branch,
            iteration: input.iteration,
            step: input.step,
            eligibleLaneIds: input.eligibleLaneIds ?? [],
          });
          const isDeclaration = input.step.effect.type === 'DECLARE_RESULTS';
          if (!isDeclaration && input.declarationConfirmation) {
            throw new Error('Declaration confirmations are only valid for RESULTS ARE FINAL');
          }
          if (isDeclaration && !authorization.eventId) {
            throw new Error('RESULTS ARE FINAL requires the Final run to be linked to an event');
          }
          if (
            isDeclaration &&
            (!input.declarationConfirmation?.finalProtestsResolved ||
              !input.declarationConfirmation.resultProcessConfirmed)
          ) {
            throw new Error('RESULTS ARE FINAL requires explicit protest and result-process confirmations');
          }
          const declaration = isDeclaration
            ? {
                eventId: authorization.eventId!,
                finalProtestsResolved: input.declarationConfirmation!.finalProtestsResolved,
                resultProcessConfirmed: input.declarationConfirmation!.resultProcessConfirmed,
                statement: input.step.text,
                officialName: authorization.officialName,
              }
            : null;
          return executeFinalScriptStep(
            {
              competitionId: input.competitionId,
              runId: input.runId,
              confirmationEntryId: input.confirmationEntryId,
              branch: input.branch,
              iteration: input.iteration,
              step: input.step,
              eligibleLaneIds: input.eligibleLaneIds ?? [],
              acknowledgedRequirementIds: input.acknowledgedRequirementIds ?? [],
              declaration,
            },
            {
              publishCue: async (cue) => {
                await mqttService.publishCompetitionCue(cue);
              },
              openSighting: async (durationSeconds, acknowledgedRequirementIds) => {
                const competition = requireCompetition(input.competitionId);
                if (competition.phase === 'SIGHTING') return null;
                assertPhaseStartReady(
                  competitionTypeRegistry.get(competition.competitionTypeId),
                  'SIGHTING',
                  acknowledgedRequirementIds,
                );
                return mqttService.startSighting(input.competitionId, durationSeconds);
              },
              closeSighting: async () => {
                const phase = requireCompetition(input.competitionId).phase;
                if (phase === 'SIGHTING_COMPLETE' || phase === 'MATCH' || phase === 'MATCH_COMPLETE') return null;
                return mqttService.endSighting(input.competitionId);
              },
              openMatch: async (step, acknowledgedRequirementIds) => {
                if (step.effect.type !== 'OPEN_FIRING' || step.effect.purpose !== 'MATCH' || !step.effect.target) {
                  throw new Error(`Final step ${step.id} has no MATCH target`);
                }
                const target = step.effect.target;
                const competition = requireCompetition(input.competitionId);
                const definition = competitionTypeRegistry.get(competition.competitionTypeId);
                const alreadyAtTarget =
                  competition.phase === 'MATCH' &&
                  competition.laneIds.every((laneId) => {
                    const laneState = mqttService
                      .getSnapshot()
                      .lanes.find((lane) => lane.laneId === laneId)?.competitionState;
                    return (
                      laneState?.competitionId === input.competitionId &&
                      laneState.currentStage.index === target.stageIndex &&
                      laneState.currentSeries.index === target.seriesIndex
                    );
                  });
                if (alreadyAtTarget) return null;

                const previous = getPreviousSeriesPosition(definition, target);
                if (!previous) {
                  assertPhaseStartReady(definition, 'MATCH', acknowledgedRequirementIds);
                  return mqttService.startMatch(input.competitionId, step.effect.durationSeconds);
                }
                const nextTimer = getNextSeriesTimer(definition, previous.stageIndex, previous.seriesIndex);
                if (
                  !nextTimer ||
                  nextTimer.stageIndex !== target.stageIndex ||
                  nextTimer.seriesIndex !== target.seriesIndex ||
                  nextTimer.durationSeconds !== step.effect.durationSeconds
                ) {
                  throw new Error(
                    `Final script timer does not match target ${target.stageIndex}:${target.seriesIndex}`,
                  );
                }
                return mqttService.advanceSeries(
                  input.competitionId,
                  previous.stageIndex,
                  previous.seriesIndex,
                  undefined,
                  nextTimer,
                );
              },
              runTimedTarget: async (step, acknowledgedRequirementIds, eligibleLaneIds) => {
                if (step.effect.type !== 'RUN_TIMED_TARGET') {
                  throw new Error(`Final step ${step.id} is not a timed-target step`);
                }
                const effect = step.effect;
                let competition = requireCompetition(input.competitionId);
                const definition = competitionTypeRegistry.get(competition.competitionTypeId);
                if (!definition.timedTarget) {
                  throw new Error(`Final step ${step.id} requires an unavailable timed-target capability`);
                }
                const program = definition.timedTarget.programs.find(
                  (candidate) => candidate.id === effect.programId && candidate.purpose === effect.purpose,
                );
                if (!program) throw new Error(`Final step ${step.id} timed-target program is unavailable`);

                if (effect.purpose === 'SHOOT_OFF') {
                  if (!effect.participantExecution) {
                    throw new Error(`Final step ${step.id} has no shoot-off participant execution mode`);
                  }
                  const snapshot = mqttService.getSnapshot();
                  const activeLaneIds = competition.laneIds.filter((laneId) => {
                    const state = snapshot.lanes.find((lane) => lane.laneId === laneId)?.competitionState;
                    return state?.competitionId !== input.competitionId || state.phase !== 'FINISHED';
                  });
                  const targetLaneIds = [...new Set(eligibleLaneIds)];
                  if (targetLaneIds.length < 2) throw new Error('Timed-target shoot-off requires at least two Lanes');
                  const inactiveLaneIds = targetLaneIds.filter((laneId) => !activeLaneIds.includes(laneId));
                  if (inactiveLaneIds.length > 0) {
                    throw new Error(`Timed-target shoot-off selected retired Lane(s): ${inactiveLaneIds.join(', ')}`);
                  }

                  const orderedLaneIds = orderFinalShootOffLaneIds(
                    targetLaneIds,
                    effect.participantExecution,
                    effect.participantOrder,
                    (laneId) => snapshot.lanes.find((lane) => lane.laneId === laneId)?.assignment?.athlete?.startNumber,
                  );

                  return mqttService.startShootOff(
                    input.competitionId,
                    input.runId,
                    input.iteration,
                    {
                      type: 'TIMED_TARGET',
                      programId: program.id,
                      participantExecution: effect.participantExecution,
                    },
                    effect.shotsPerParticipant,
                    orderedLaneIds,
                  );
                }

                if (!effect.target) throw new Error(`Final step ${step.id} has no timed-target series target`);
                const target = effect.target;
                const stage = definition.config.stages[target.stageIndex];
                const series = stage?.series[target.seriesIndex];
                if (!stage || !series || stage.type !== 'match') {
                  throw new Error(`Final step ${step.id} targets an unavailable timed-target series`);
                }

                if (competition.phase === 'NOT_STARTED') {
                  if (effect.purpose !== 'SIGHTING') {
                    throw new Error('The configured sighting sequence must run before MATCH timed-target firing');
                  }
                  assertPhaseStartReady(definition, 'SIGHTING', acknowledgedRequirementIds);
                  const preparationDuration =
                    definition.config.stages.find((candidate) => candidate.type === 'preparation')?.timer.durationSec ??
                    1;
                  const sightingStart = await mqttService.startSighting(input.competitionId, preparationDuration);
                  assertCommandSucceeded(sightingStart, 'Preparing the Lane sighting stage');
                  competition = requireCompetition(input.competitionId);
                }
                if (competition.phase === 'SIGHTING') {
                  const sightingEnd = await mqttService.endSighting(input.competitionId);
                  assertCommandSucceeded(sightingEnd, 'Closing the Lane sighting stage');
                  competition = requireCompetition(input.competitionId);
                }
                if (competition.phase === 'SIGHTING_COMPLETE') {
                  assertPhaseStartReady(definition, 'MATCH', acknowledgedRequirementIds);
                  const matchStart = await mqttService.startMatch(input.competitionId);
                  assertCommandSucceeded(matchStart, 'Entering the timed-target MATCH stage');
                  competition = requireCompetition(input.competitionId);
                }
                if (competition.phase !== 'MATCH') {
                  throw new Error(`Timed-target Final cannot run from competition phase ${competition.phase}`);
                }

                const snapshot = mqttService.getSnapshot();
                const activeLaneIds = competition.laneIds.filter((laneId) => {
                  const state = snapshot.lanes.find((lane) => lane.laneId === laneId)?.competitionState;
                  return state?.competitionId !== input.competitionId || state.phase !== 'FINISHED';
                });
                const targetLaneIds = [...new Set(eligibleLaneIds.length > 0 ? eligibleLaneIds : activeLaneIds)];
                if (targetLaneIds.length === 0) throw new Error('Timed-target Final step has no active Lane');
                const inactiveLaneIds = targetLaneIds.filter((laneId) => !activeLaneIds.includes(laneId));
                if (inactiveLaneIds.length > 0) {
                  throw new Error(`Timed-target Final step selected retired Lane(s): ${inactiveLaneIds.join(', ')}`);
                }

                const atTarget = targetLaneIds.every((laneId) => {
                  const laneState = mqttService
                    .getSnapshot()
                    .lanes.find((lane) => lane.laneId === laneId)?.competitionState;
                  return (
                    laneState?.competitionId === input.competitionId &&
                    laneState.phase === 'MATCH' &&
                    laneState.awaitingSeriesStart !== true &&
                    laneState.currentStage.index === target.stageIndex &&
                    laneState.currentSeries.index === target.seriesIndex
                  );
                });
                if (!atTarget) {
                  const previous = getPreviousSeriesPosition(definition, target);
                  if (previous) {
                    const advanced = await mqttService.advanceSeries(
                      input.competitionId,
                      previous.stageIndex,
                      previous.seriesIndex,
                    );
                    assertCommandSucceeded(advanced, `Advancing to ${target.stageIndex}:${target.seriesIndex}`);
                  }
                }

                return mqttService.startTimedTarget({
                  competitionId: input.competitionId,
                  programId: program.id,
                  purpose: effect.purpose,
                  stageIndex: target.stageIndex,
                  seriesIndex: target.seriesIndex,
                  targetLaneIds,
                });
              },
              closeMatch: async () => {
                const competition = requireCompetition(input.competitionId);
                if (competition.phase === 'MATCH_COMPLETE' || !competition.activeTimer) return null;
                return mqttService.stopActiveTimer(input.competitionId);
              },
              openShootOff: async (durationSeconds, shotsPerLane, eligibleLaneIds) =>
                mqttService.startShootOff(
                  input.competitionId,
                  input.runId,
                  input.iteration,
                  { type: 'GENERIC', durationSeconds },
                  shotsPerLane,
                  eligibleLaneIds,
                ),
              closeShootOff: async (eligibleLaneIds) =>
                mqttService.stopShootOff(input.competitionId, input.runId, input.iteration, eligibleLaneIds),
              declareResults: async (declarationInput) => {
                const current = await finalResultDeclarationService.getStatus(declarationInput.eventId);
                if (current.declaration) {
                  if (!current.declarationCurrent || current.issues.length > 0) {
                    throw new Error('The existing Final declaration is no longer current or has review blockers');
                  }
                  return { declarationId: current.declaration.id, replayed: true };
                }
                const declared = await finalResultDeclarationService.declare(declarationInput);
                if (!declared.declaration) throw new Error('The Final result declaration was not persisted');
                return { declarationId: declared.declaration.id, replayed: false };
              },
            },
          );
        }),
      clearFinalCue: (input) => runWithControlLock(() => mqttService.clearCompetitionCue(input.competitionId)),
      restartTimer: (input) =>
        runWithControlLock(() =>
          mqttService.restartTimer(
            input.competitionId,
            input.timerScope,
            input.durationSeconds,
            input.stageIndex,
            input.seriesIndex,
          ),
        ),
      advanceSeries: (input) =>
        runWithControlLock(() => {
          const competition = requireCompetition(input.competitionId);
          const definition = competitionTypeRegistry.get(competition.competitionTypeId);
          return mqttService.advanceSeries(
            input.competitionId,
            input.stageIndex,
            input.fromSeriesIndex,
            input.resumeOnly,
            getNextSeriesTimer(definition, input.stageIndex, input.fromSeriesIndex),
          );
        }),
      retireFinalist: (input) =>
        runWithControlLock(() =>
          mqttService.retireFinalist(
            input.competitionId,
            input.laneId,
            input.checkpointId,
            input.rank,
            input.afterShot,
          ),
        ),
      finishCompetition: (input) =>
        runWithControlLock(async () => {
          const competition = requireCompetition(input.competitionId);

          if (input.resultContext && !competition.cleanupPreparedAt) {
            if (competition.phase !== 'MATCH' && competition.phase !== 'MATCH_COMPLETE') {
              throw new Error(
                `Cannot publish results while competition ${input.competitionId} is in phase ${competition.phase}`,
              );
            }
            const event = (await queryBus.execute(GetEventByIdToken, {
              eventId: input.resultContext.eventId,
            })) as GetEventByIdResponse | null;
            if (event && event.eventType !== competition.competitionTypeId) {
              throw new Error(
                `Selected event uses competition type ${event.eventType}, but the active competition uses ${competition.competitionTypeId}`,
              );
            }
          }

          let resultPublication: PublishResultsResponse | undefined;
          const resultContext = input.resultContext;
          const beforeCleanup = resultContext
            ? async (lanes: CompetitionResultLane[]) => {
                try {
                  const publicationToken =
                    competition.roundName !== 'Final'
                      ? PublishMqttResultsToken
                      : competition.competitionUnit === 'MIXED_TEAM'
                        ? PublishMqttMixedTeamFinalResultsToken
                        : PublishMqttFinalResultsToken;
                  resultPublication = await commandBus.execute(publicationToken, {
                    competitionId: input.competitionId,
                    competitionTypeId: competition.competitionTypeId,
                    eventId: resultContext.eventId,
                    relayNumber: resultContext.relayNumber,
                    lanes,
                  });
                  return resultPublication.errors.length === 0;
                } catch (error) {
                  resultPublication = {
                    savedCount: 0,
                    errors: [error instanceof Error ? error.message : String(error)],
                  };
                  return false;
                }
              }
            : undefined;
          const beforeDataClear = () =>
            competitionDataGuard.assertAllowed({
              operation: 'CLEAR_COMPETITION_DATA',
              competitionId: input.competitionId,
            });
          const result = await mqttService.finishCompetition(input.competitionId, beforeCleanup, beforeDataClear);
          return resultPublication ? { ...result, resultPublication } : result;
        }),
    });

    return {
      lifecycle: [
        {
          name: 'EmbeddedMqttBroker',
          start: () =>
            runWithRuntimeLock(async () => {
              if (appConfigService.get('mqtt.broker.mode') === 'embedded') {
                await embeddedMqttBroker.start();
              }
            }),
          stop: () => runWithRuntimeLock(() => embeddedMqttBroker.stop()),
        },
        {
          name: 'DirectorMqttService',
          start: () =>
            runWithRuntimeLock(async () => {
              try {
                await reconnectClient();
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger.warn(`MQTT startup connection failed: ${sanitizeBrokerUrl(message)}`);
                setTimeout(() => {
                  eventBus.emit({
                    type: 'MqttConnectionError',
                    timestamp: Date.now(),
                    message: `Failed to connect to MQTT broker: ${message}`,
                  });
                }, 1_000);
              }
            }),
          stop: () => runWithRuntimeLock(() => mqttService.disconnect()),
        },
      ],
      eventForwarding: [
        {
          eventType: 'ShotReceived',
          channel: eventsContract.channels.shotReceived,
          extractPayload: (event: AnyDomainEvent) => {
            const shot = event as ShotReceived;
            return {
              channel: shot.channel,
              shotNumber: shot.shotNumber,
              score: shot.score,
              seriesNumber: shot.seriesNumber,
            };
          },
        },
        {
          eventType: 'LaneConnected',
          channel: eventsContract.channels.laneConnected,
          extractPayload: (event: AnyDomainEvent) => ({
            channel: (event as LaneConnected).channel,
          }),
        },
        {
          eventType: 'DebugLogEmitted',
          channel: eventsContract.channels.debugLog,
          extractPayload: (event: AnyDomainEvent) => {
            const entry = event as DebugLogEmitted;
            return {
              timestamp: entry.timestamp,
              direction: entry.direction,
              raw: entry.raw,
              parsed: entry.parsed,
            };
          },
        },
        {
          eventType: 'MqttConnectionError',
          channel: eventsContract.channels.mqttConnectionError,
          extractPayload: (event: AnyDomainEvent) => ({
            message: (event as MqttConnectionError).message,
          }),
        },
        {
          eventType: 'MqttControlStateChanged',
          channel: eventsContract.channels.mqttControlStateChanged,
          extractPayload: (event: AnyDomainEvent) => (event as MqttControlStateChanged).snapshot,
        },
        {
          eventType: 'FiringWindowViolationDetected',
          channel: eventsContract.channels.firingWindowViolationDetected,
          extractPayload: (event: AnyDomainEvent) =>
            toFiringWindowViolationDto((event as FiringWindowViolationDetected).violation),
        },
        {
          eventType: 'ShotObservationEvidenceObserved',
          channel: eventsContract.channels.shotObservationEvidenceObserved,
          extractPayload: (event: AnyDomainEvent) => {
            const observed = event as ShotObservationEvidenceObserved;
            return { ...observed.evidence, observedAt: observed.observedAt.toISOString() };
          },
        },
      ],
    };
  },
};

function toSafetyLaneOutcomes(result: CommandBatchResult) {
  return result.commands.flatMap((command) =>
    command.lanes.map((lane) => ({
      laneId: lane.laneId,
      status: lane.status,
      errorCode: lane.error?.code ?? null,
      errorMessage: lane.error?.message ?? null,
      acknowledgedAt: lane.acknowledgedAt ? new Date(lane.acknowledgedAt) : null,
    })),
  );
}

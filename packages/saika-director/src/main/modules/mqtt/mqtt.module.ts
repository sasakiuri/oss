// SPDX-License-Identifier: MIT
import { networkInterfaces } from 'node:os';

import { FinalFiringContextToken, FinalFiringTransportToken } from '@/main/modules/final-recovery-firing';
import {
  OperationalProfileService,
  directorOperationalPresets,
  type OperationalSettingTarget,
} from '@/main/modules/operational-profiles';
import {
  ApplyQualificationRecoverySettlementTransportToken,
  ApplyQualificationRecoveryTransportToken,
  CancelQualificationRecoveryTransportToken,
  StartQualificationRecoveryTransportToken,
  type StartQualificationRecoveryTransportInput,
} from '@/main/modules/range-interruptions';
import {
  ReserveTransferDataGuard,
  ResumeReserveLaneToken,
  ResumeReserveMatchToken,
  SqliteReserveTransferRepository,
  TransferReserveLaneToken,
} from '@/main/modules/reserve-lane-transfers';
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import type { ModuleDefinition, ModuleOutput } from '@/main/shared-infra/module/ModuleDefinition';
import { RuntimeOperationGate } from '@/main/shared-infra/operations/RuntimeOperationGate';
import type { FiringWindowDetectionPolicy } from '@/shared/competitionTypes';
import { eventsContract, mqttContract, type MqttControlSnapshotDto } from '@/shared/ipc/contracts';
import { operationalProfilesContract } from '@/shared/ipc/contracts/operationalProfiles.contract';
import { Logger } from '@/shared/utils/Logger';

import { createCompetitionControlHandlers } from './application/createCompetitionControlHandlers';
import { createFinalControlHandlers } from './application/createFinalControlHandlers';
import { createSafetyControlHandlers } from './application/createSafetyControlHandlers';
import { sanitizeBrokerUrl } from './application/DirectorMqttConnection';
import { DirectorMqttService } from './application/DirectorMqttService';
import type { MqttControlSnapshot } from './application/DirectorMqttTypes';
import { FiringPointNumberResolver } from './application/FiringPointNumberResolver';
import { FiringWindowDetectionService } from './application/FiringWindowDetectionService';
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
import type { MqttCredentials } from './domain/IMqttTransport';
import { LaneTimingEvidencePolicy } from './domain/LaneTimingEvidencePolicy';
import { SafetyStopClearancePolicy } from './domain/SafetyStopClearancePolicy';
import { TimedTargetReadinessPolicy } from './domain/TimedTargetReadinessPolicy';
import { EmbeddedMqttBroker } from './infra/EmbeddedMqttBroker';
import { MqttTransport } from './infra/MqttTransport';
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
  | 'operationalSettingTargets'
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
    'operationalSettingTargets',
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
    const readTimedTargetReadinessSettings = () => ({
      windowEnforcement: appConfigService.get('timedTargetReadiness.windowEnforcement'),
      boundedShotTiming: appConfigService.get('timedTargetReadiness.boundedShotTiming'),
      physicalSignals: appConfigService.get('timedTargetReadiness.physicalSignals'),
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
      new MqttTransport(),
      new ClockQualityPolicy(readClockQualitySettings()),
    );
    mqttService.setTimingEvidencePolicy(
      new LaneTimingEvidencePolicy(() => appConfigService.get('timingEvidence.mode')),
    );
    mqttService.setTimedTargetReadinessPolicy(new TimedTargetReadinessPolicy(readTimedTargetReadinessSettings));
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

    const operationGate = new RuntimeOperationGate();
    const runWithRuntimeLock = operationGate.runTransition;
    const runWithControlLock = operationGate.runControl;

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
        ...ctx.operationalSettingTargets.map((target) => ({
          ...target,
          write: (competitionId: string, mode: Parameters<typeof target.write>[1]) => {
            if (
              target.scope === 'DIRECTOR' &&
              mqttService
                .getSnapshot()
                .competitions.some((competition) => !['NOT_STARTED', 'MATCH_COMPLETE'].includes(competition.phase))
            )
              throw new Error('Finish active competitions before changing a shared Director policy');
            return target.write(competitionId, mode);
          },
        })),
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
          id: 'timing-evidence',
          label: 'Lane measurement evidence, expiry and installation match',
          scope: 'DIRECTOR',
          read: () => ({
            mode: appConfigService.get('timingEvidence.mode'),
            context: 'Applies before timed commands on every selected Lane.',
          }),
          write: (_competitionId, mode) => {
            if (
              mqttService
                .getSnapshot()
                .competitions.some((competition) => !['NOT_STARTED', 'MATCH_COMPLETE'].includes(competition.phase))
            )
              throw new Error('Finish active competitions before changing shared timing evidence policy');
            appConfigService.set('timingEvidence.mode', mode);
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
        ...(
          [
            ['windowEnforcement', 'Lane firing-window enforcement'],
            ['boundedShotTiming', 'Lane measured shot timing'],
            ['physicalSignals', 'Integrated target signals'],
          ] as const
        ).map(([key, label]): OperationalSettingTarget => ({
          id: `timed-target-${key}`,
          label,
          scope: 'DIRECTOR',
          read: () => ({
            mode: readTimedTargetReadinessSettings()[key],
            context: 'Applies before timed target firing on every selected Lane.',
          }),
          write: (_competitionId, mode) => {
            if (
              mqttService
                .getSnapshot()
                .competitions.some((competition) => !['NOT_STARTED', 'MATCH_COMPLETE'].includes(competition.phase))
            )
              throw new Error('Finish active competitions before changing a shared timed target policy');
            appConfigService.set(`timedTargetReadiness.${key}`, mode);
          },
        })),
      ],
      (competitionId) => {
        const competition = mqttService.getSnapshot().competitions.find((item) => item.competitionId === competitionId);
        if (!competition || competition.phase !== 'NOT_STARTED')
          throw new Error('Select a competition that has not started before applying an operational profile');
      },
      directorOperationalPresets,
    );
    ipcRouter.register(operationalProfilesContract, {
      preview: (input) => operationalProfiles.preview(input),
      apply: (input) => runWithControlLock(() => operationalProfiles.apply(input)),
    });

    ipcRouter.register(mqttContract, {
      ...createCompetitionControlHandlers({
        mqttService,
        runWithControlLock,
        competitionTypeRegistry,
        competitionDataGuard,
        participantEligibilityReader,
        commandBus,
        queryBus,
        competitionStartReadiness: ctx.competitionStartReadiness,
        requireCompetition,
      }),
      ...createFinalControlHandlers({
        mqttService,
        runWithControlLock,
        competitionTypeRegistry,
        finalOperationService,
        finalResultDeclarationService,
        requireCompetition,
      }),
      ...createSafetyControlHandlers({
        mqttService,
        runWithControlLock,
        safetyStopAuditJournal,
        safetyStopClearancePolicy,
      }),
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
      probeLaneClock: (input) => runWithControlLock(() => mqttService.probeLaneClock(input.laneId)),
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

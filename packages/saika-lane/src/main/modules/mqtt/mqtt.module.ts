// SPDX-License-Identifier: MIT
/**
 * MQTT module definition
 *
 * Handles initialization of MqttClientService, starting publishers, and registering command handlers and IPC handlers.
 */

import { app } from 'electron';

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { ALL_COMPETITION_TYPES } from '@/main/modules/competition/domain/competitionTypes';
import { SqliteCompetitionShootOffShotOutbox } from '@/main/modules/competition-shoot-off';
import { EstComplaintSignalService, SqliteEstComplaintSignalRepository } from '@/main/modules/est-complaint-signal';
import { MalfunctionFiringService, SqliteMalfunctionFiringRepository } from '@/main/modules/malfunction-firing';
import {
  QualificationMalfunctionSignalService,
  SqliteQualificationMalfunctionSignalRepository,
} from '@/main/modules/qualification-malfunction-signal';
import { SqliteQualificationRecoveryShotOutbox } from '@/main/modules/qualification-recovery';
import { RangeOfficerRequestService, SqliteRangeOfficerRequestRepository } from '@/main/modules/range-officer-request';
import { ReserveLaneTransferService } from '@/main/modules/reserve-lane-transfer/application/ReserveLaneTransferService';
import { SqliteReserveLaneTransferJournal } from '@/main/modules/reserve-lane-transfer/infra/SqliteReserveLaneTransferJournal';
import { StoredReserveLaneTransferState } from '@/main/modules/reserve-lane-transfer/infra/StoredReserveLaneTransferState';
import { SqliteShotObservationEvidenceOutbox } from '@/main/modules/shot-observation/infra/SqliteShotObservationEvidenceOutbox';
import { SqliteTimedTargetSequenceRepository } from '@/main/modules/timed-target';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { mqttContract } from '@/shared/ipc/contracts';
import type { MqttSettings } from '@/shared/ipc/contracts/mqtt.contract';
import type { InferHandlers } from '@/shared/ipc/defineContract';

import { AssignedFinalRecoveryFiringContextSource } from './application/AssignedFinalRecoveryFiringContextSource';
import { AssignedMalfunctionFiringContextSource } from './application/AssignedMalfunctionFiringContextSource';
import { BroadcastCommandHandler } from './application/commands/BroadcastCommandHandler';
import { CommandIdempotencyGuard } from './application/commands/CommandIdempotencyGuard';
import { LaneTier1CommandHandler } from './application/commands/LaneTier1CommandHandler';
import { PerLaneCommandHandler } from './application/commands/PerLaneCommandHandler';
import { CompetitionCueSubscriber } from './application/CompetitionCueSubscriber';
import { CompetitionShootOffShotPublisher } from './application/CompetitionShootOffShotPublisher';
import { CompetitionShotPublisher } from './application/CompetitionShotPublisher';
import { CompetitionStateSubscriber } from './application/CompetitionStateSubscriber';
import { EstComplaintSignalPublisher, toEstComplaintSignalPayload } from './application/EstComplaintSignalPublisher';
import { HardwareStatePublisher } from './application/HardwareStatePublisher';
import { LaneAssignmentPublisher } from './application/LaneAssignmentPublisher';
import { LaneCompetitionStatePublisher } from './application/LaneCompetitionStatePublisher';
import { LaneEstComplaintContextSource } from './application/LaneEstComplaintContextSource';
import { LaneQualificationMalfunctionContextSource } from './application/LaneQualificationMalfunctionContextSource';
import { LaneSafetyStatePublisher } from './application/LaneSafetyStatePublisher';
import { LaneScorePublisher } from './application/LaneScorePublisher';
import {
  QualificationMalfunctionSignalPublisher,
  toQualificationMalfunctionSignalPayload,
} from './application/QualificationMalfunctionSignalPublisher';
import { QualificationRecoveryShotPublisher } from './application/QualificationRecoveryShotPublisher';
import { QualificationRecoveryStatePublisher } from './application/QualificationRecoveryStatePublisher';
import { RangeOfficerRequestPublisher } from './application/RangeOfficerRequestPublisher';
import { RawShotPublisher } from './application/RawShotPublisher';
import { RetainPublisher } from './application/RetainPublisher';
import { RpcRequestHandler } from './application/RpcRequestHandler';
import { ShotObservationEvidencePublisher } from './application/ShotObservationEvidencePublisher';
import { TimedTargetStatePublisher } from './application/TimedTargetStatePublisher';
import { commandAuthorizationPolicyFromEnvironment } from './domain/CommandAuthorizationPolicy';
import { AthleteSchema } from './domain/MqttAssignmentSchemas';
import { MqttClientService, sanitizeBrokerUrl } from './infra/MqttClientService';

type MqttDeps =
  | 'eventBus'
  | 'ipcRouter'
  | 'storage'
  | 'settingsStore'
  | 'queryBus'
  | 'commandBus'
  | 'competitionRepository'
  | 'timerService'
  | 'competitionInterruptionControl'
  | 'competitionShootOffControl'
  | 'qualificationRecoveryControl'
  | 'qualificationRecoveryAdjudicationControl'
  | 'qualificationRecoverySettlementControl'
  | 'safetyStopControl'
  | 'timingProfileService'
  | 'timedTargetControl'
  | 'sessionRepository'
  | 'database';

function mqttCredentialsFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): { username: string; password: string } | undefined {
  const username = environment.SAIKA_MQTT_LANE_USERNAME?.trim();
  const password = environment.SAIKA_MQTT_LANE_PASSWORD;
  if (!username && !password) return undefined;
  if (!username || !password) {
    throw new Error('MQTT credentials require both SAIKA_MQTT_LANE_USERNAME and SAIKA_MQTT_LANE_PASSWORD');
  }
  return { username, password };
}

export const mqttModule: ModuleDefinition<MqttDeps> = {
  name: 'mqtt',
  deps: [
    'eventBus',
    'ipcRouter',
    'storage',
    'settingsStore',
    'queryBus',
    'commandBus',
    'competitionRepository',
    'timerService',
    'competitionInterruptionControl',
    'competitionShootOffControl',
    'qualificationRecoveryControl',
    'qualificationRecoveryAdjudicationControl',
    'qualificationRecoverySettlementControl',
    'safetyStopControl',
    'timedTargetControl',
    'timingProfileService',
    'sessionRepository',
    'database',
  ] as const,
  register({
    eventBus,
    ipcRouter,
    storage,
    settingsStore,
    queryBus,
    commandBus,
    competitionRepository,
    timerService,
    competitionInterruptionControl,
    competitionShootOffControl,
    qualificationRecoveryControl,
    qualificationRecoveryAdjudicationControl,
    qualificationRecoverySettlementControl,
    safetyStopControl,
    timedTargetControl,
    timingProfileService,
    sessionRepository,
    database,
  }) {
    const mqttClient = new MqttClientService();
    const appVersion = app.getVersion();
    const idempotencyGuard = new CommandIdempotencyGuard();
    const getLaneId = (): string => settingsStore.getLaneId();
    const definitionsById = new Map(ALL_COMPETITION_TYPES.map((definition) => [definition.id, definition]));
    const rulePacks = ALL_COMPETITION_TYPES.flatMap((definition) =>
      definition.rulePackIdentity ? [definition.rulePackIdentity] : [],
    );
    const commandAuthorization = commandAuthorizationPolicyFromEnvironment(process.env);
    const mqttCredentials = mqttCredentialsFromEnvironment(process.env);
    const rangeOfficerRequestService = new RangeOfficerRequestService(
      new SqliteRangeOfficerRequestRepository(database),
    );
    const qualificationMalfunctionSignalService = new QualificationMalfunctionSignalService(
      new SqliteQualificationMalfunctionSignalRepository(database),
    );
    const estComplaintSignalService = new EstComplaintSignalService(new SqliteEstComplaintSignalRepository(database));

    // Initialize publishers (they subscribe to EventBus events)
    const hardwarePublisher = new HardwareStatePublisher(mqttClient, eventBus, storage, appVersion, () => ({
      timingEvidence: timingProfileService.evidenceReport(),
      competitionProtocolVersions: [1],
      rulePacks,
      timedTargetPolicy: {
        enforcementMode: timedTargetControl.enforcementMode,
        ...(timedTargetControl.timingSettings ? { shotTiming: timedTargetControl.timingSettings } : {}),
      },
      targetIntegration: {
        schemaVersion: 1,
        timedTarget: {
          actuation: 'NOT_INTEGRATED',
          feedback: 'NOT_INTEGRATED',
        },
      },
    }));
    timingProfileService.subscribe(() => hardwarePublisher.publishState());
    new CompetitionShootOffShotPublisher(
      mqttClient,
      eventBus,
      storage,
      competitionShootOffControl,
      new SqliteCompetitionShootOffShotOutbox(database),
    );
    const qualificationRecoveryShotOutbox = new SqliteQualificationRecoveryShotOutbox(database);
    new QualificationRecoveryShotPublisher(
      mqttClient,
      eventBus,
      storage,
      qualificationRecoveryControl,
      qualificationRecoveryShotOutbox,
    );
    new RawShotPublisher(mqttClient, eventBus, storage);
    new ShotObservationEvidencePublisher(
      mqttClient,
      eventBus,
      storage,
      new SqliteShotObservationEvidenceOutbox(database),
    );

    // Initialize competition publishers
    const competitionStatePublisher = new LaneCompetitionStatePublisher(
      mqttClient,
      eventBus,
      storage,
      competitionRepository,
      (competitionId) => competitionInterruptionControl.get(competitionId),
    );
    const scorePublisher = new LaneScorePublisher(mqttClient, eventBus, storage, competitionRepository, queryBus);
    new CompetitionShotPublisher(
      mqttClient,
      eventBus,
      storage,
      competitionRepository,
      sessionRepository,
      competitionShootOffControl,
    );
    const assignmentPublisher = new LaneAssignmentPublisher(mqttClient, storage, getLaneId);
    const reserveTransferControl = new ReserveLaneTransferService(
      new SqliteReserveLaneTransferJournal(database),
      new StoredReserveLaneTransferState(
        competitionRepository,
        sessionRepository,
        {
          read: (competitionId) => assignmentPublisher.getCurrentAssignment(competitionId),
          restore: async (competitionId, json) => {
            await assignmentPublisher.assign(
              competitionId,
              json === null ? null : AthleteSchema.parse(JSON.parse(json).athlete),
            );
          },
        },
        safetyStopControl,
        competitionInterruptionControl,
        eventBus,
      ),
      getLaneId,
    );
    const malfunctionFiringControl = new MalfunctionFiringService(
      new SqliteMalfunctionFiringRepository(database),
      {
        prepare: (request) =>
          request.workflow === 'FINAL_RECOVERY'
            ? new AssignedFinalRecoveryFiringContextSource(
                competitionRepository,
                assignmentPublisher,
                () => !safetyStopControl.isStopped(),
              ).prepare(request)
            : new AssignedMalfunctionFiringContextSource(
                competitionRepository,
                assignmentPublisher,
                () => !safetyStopControl.isStopped(),
              ).prepare(request),
      },
      timedTargetControl,
      eventBus,
      undefined,
      (runId) =>
        new SqliteTimedTargetSequenceRepository(database)
          .findBySequenceId(runId)
          ?.acceptedShots.map((shot) => shot.observationId) ?? [],
    );
    eventBus.on('MqttConnected', () => malfunctionFiringControl.restore());
    const qualificationMalfunctionContextSource = new LaneQualificationMalfunctionContextSource(
      competitionRepository,
      sessionRepository,
      assignmentPublisher,
      timedTargetControl,
    );
    const estComplaintContextSource = new LaneEstComplaintContextSource(
      competitionRepository,
      sessionRepository,
      assignmentPublisher,
      timedTargetControl,
    );
    const safetyStatePublisher = new LaneSafetyStatePublisher(mqttClient, eventBus, storage, safetyStopControl);
    const rangeOfficerRequestPublisher = new RangeOfficerRequestPublisher(
      mqttClient,
      storage,
      rangeOfficerRequestService,
    );
    const qualificationMalfunctionSignalPublisher = new QualificationMalfunctionSignalPublisher(
      mqttClient,
      storage,
      qualificationMalfunctionSignalService,
    );
    const estComplaintSignalPublisher = new EstComplaintSignalPublisher(mqttClient, storage, estComplaintSignalService);
    const timedTargetStatePublisher = new TimedTargetStatePublisher(mqttClient, eventBus, storage, timedTargetControl);
    const qualificationRecoveryStatePublisher = new QualificationRecoveryStatePublisher(
      mqttClient,
      eventBus,
      storage,
      qualificationRecoveryControl,
    );

    // Initialize retain publisher (handles reconnect republish + shot backlog replay)
    const retainPublisher = new RetainPublisher(
      mqttClient,
      storage,
      competitionRepository,
      sessionRepository,
      hardwarePublisher,
      competitionStatePublisher,
      scorePublisher,
      assignmentPublisher,
      safetyStatePublisher,
      rangeOfficerRequestPublisher,
      timedTargetStatePublisher,
      qualificationRecoveryStatePublisher,
      (shotId) => qualificationRecoveryShotOutbox.hasShot(shotId),
      qualificationMalfunctionSignalPublisher,
      estComplaintSignalPublisher,
    );

    // Initialize RPC handler
    const rpcHandler = new RpcRequestHandler(mqttClient, storage, queryBus);

    // Initialize competition state subscriber
    const competitionStateSubscriber = new CompetitionStateSubscriber(
      mqttClient,
      commandBus,
      competitionRepository,
      undefined,
      (competitionTypeId) => definitionsById.get(competitionTypeId),
    );
    const competitionCueSubscriber = new CompetitionCueSubscriber(mqttClient, eventBus, getLaneId);

    // Initialize command handlers (laneId is read dynamically via getter)
    const competitionId = ''; // Set when joining a competition

    const broadcastHandler = new BroadcastCommandHandler(
      mqttClient,
      commandBus,
      timerService,
      competitionRepository,
      competitionStatePublisher,
      scorePublisher,
      idempotencyGuard,
      getLaneId,
      competitionId,
      competitionInterruptionControl,
      safetyStopControl,
      competitionShootOffControl,
      commandAuthorization,
      timedTargetControl,
    );

    const perLaneHandler = new PerLaneCommandHandler(
      mqttClient,
      commandBus,
      idempotencyGuard,
      competitionRepository,
      assignmentPublisher,
      scorePublisher,
      competitionStatePublisher,
      competitionInterruptionControl,
      getLaneId,
      competitionId,
      safetyStopControl,
      commandAuthorization,
      qualificationRecoveryControl,
      qualificationRecoveryStatePublisher,
      qualificationRecoveryAdjudicationControl,
      qualificationRecoverySettlementControl,
      malfunctionFiringControl,
      reserveTransferControl,
      (competitionId) => retainPublisher.replayTransferredSession(competitionId),
    );

    const tier1Handler = new LaneTier1CommandHandler(
      mqttClient,
      idempotencyGuard,
      broadcastHandler,
      perLaneHandler,
      rpcHandler,
      competitionStateSubscriber,
      retainPublisher,
      storage,
      getLaneId,
      safetyStopControl,
      safetyStatePublisher,
      competitionCueSubscriber,
      competitionShootOffControl,
      commandAuthorization,
      timedTargetControl,
    );

    // IPC handlers
    const handlers: InferHandlers<typeof mqttContract> = {
      connectMqtt: async (input) => {
        const logger = getLogger();
        const currentLaneId = settingsStore.getLaneId();
        const savedSettings = settingsStore.getMqttSettings();
        const laneAlias = input.laneAlias ?? savedSettings?.laneAlias ?? '';

        try {
          if (mqttClient.isConnected()) {
            hardwarePublisher.stopHeartbeat();
            await hardwarePublisher.publishOfflineState();
            await tier1Handler.unsubscribe();
            await mqttClient.disconnect();
          }

          // Set Will message on MqttClientService before connecting
          hardwarePublisher.setRuntimeLaneAlias(laneAlias);
          mqttClient.setWill(hardwarePublisher.getWillTopic(), hardwarePublisher.getWillPayload(), 1, true);

          await mqttClient.connect({
            brokerUrl: input.brokerUrl,
            clientId: `saika-lane-${currentLaneId}`,
            ...(mqttCredentials ? { credentials: mqttCredentials } : {}),
          });

          // Register reconnect callbacks (must be after connect so onConnect/onDisconnect work)
          retainPublisher.registerCallbacks(true);

          // Publish initial state
          hardwarePublisher.resumePublishing();
          hardwarePublisher.publishState();
          await safetyStatePublisher.publishCurrentState();
          await rangeOfficerRequestPublisher.publishCurrentState();
          await qualificationMalfunctionSignalPublisher.publishCurrentState();
          await estComplaintSignalPublisher.publishCurrentState();
          await timedTargetStatePublisher.publishCurrentState();
          await qualificationRecoveryStatePublisher.publishCurrentState();
          hardwarePublisher.startHeartbeat();

          // Subscribe to Tier1 commands
          await tier1Handler.subscribe();

          // Save settings if autoConnect requested
          if (input.autoConnect) {
            const settings: MqttSettings = {
              enabled: true,
              brokerUrl: input.brokerUrl,
              laneAlias,
              autoConnect: true,
              laneId: currentLaneId,
            };
            settingsStore.saveMqttSettings(settings);
            hardwarePublisher.setRuntimeLaneAlias(null);
          }

          // Emit MqttConnected event for ContractEventForwarder
          eventBus.emit({
            type: 'MqttConnected',
            timestamp: Date.now(),
            aggregateId: currentLaneId,
            brokerUrl: sanitizeBrokerUrl(input.brokerUrl),
            laneId: currentLaneId,
          });

          logger.info(`[MQTT Module] Connected to ${sanitizeBrokerUrl(input.brokerUrl)}`, 'mqtt');
        } catch (error) {
          hardwarePublisher.stopHeartbeat();
          await hardwarePublisher.publishOfflineState().catch(() => undefined);
          await tier1Handler.unsubscribe().catch(() => undefined);
          await mqttClient.disconnect().catch(() => undefined);
          throw error;
        }
      },

      disconnectMqtt: async () => {
        hardwarePublisher.stopHeartbeat();
        // A graceful MQTT DISCONNECT does not trigger the broker Will. Publish
        // the same retained offline state explicitly before closing the socket.
        await hardwarePublisher.publishOfflineState();
        await tier1Handler.unsubscribe();
        await mqttClient.disconnect();

        // Emit MqttDisconnected event for ContractEventForwarder
        eventBus.emit({
          type: 'MqttDisconnected',
          timestamp: Date.now(),
          aggregateId: '',
        });
      },

      getMqttStatus: async () => {
        const currentLaneId = settingsStore.getLaneId();
        const settings = settingsStore.getMqttSettings();

        return {
          status: mqttClient.isConnected() ? ('connected' as const) : ('disconnected' as const),
          brokerUrl: settings?.brokerUrl,
          laneId: currentLaneId,
        };
      },

      getSafetyState: async () => toSafetyStateDto(safetyStopControl.getState()),

      getRangeOfficerRequest: async () => toRangeOfficerRequestDto(getLaneId(), rangeOfficerRequestService.getState()),

      requestRangeOfficer: async (input) => {
        const state = rangeOfficerRequestService.request(input);
        await rangeOfficerRequestPublisher.publishCurrentState().catch((error: unknown) => {
          getLogger().warn('[MQTT Module] Range Officer request retained locally for retry', 'mqtt', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        return toRangeOfficerRequestDto(getLaneId(), state);
      },

      clearRangeOfficerRequest: async (input) => {
        const state = rangeOfficerRequestService.clear({ ...input, clearedBy: 'Lane user' });
        await rangeOfficerRequestPublisher.publishCurrentState().catch((error: unknown) => {
          getLogger().warn('[MQTT Module] Cleared Range Officer request retained locally for retry', 'mqtt', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        return toRangeOfficerRequestDto(getLaneId(), state);
      },

      getQualificationMalfunctionSignal: async () =>
        toQualificationMalfunctionSignalPayload(getLaneId(), qualificationMalfunctionSignalService.getState()),

      declareQualificationMalfunction: async (input) => {
        const context = await qualificationMalfunctionContextSource.capture();
        const state = qualificationMalfunctionSignalService.signal({ context, message: input.message });
        await qualificationMalfunctionSignalPublisher.publishCurrentState().catch((error: unknown) => {
          getLogger().warn('[MQTT Module] Qualification malfunction signal retained locally for retry', 'mqtt', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        return toQualificationMalfunctionSignalPayload(getLaneId(), state);
      },

      clearQualificationMalfunctionSignal: async (input) => {
        const state = qualificationMalfunctionSignalService.clear({ ...input, clearedBy: 'Lane user' });
        await qualificationMalfunctionSignalPublisher.publishCurrentState().catch((error: unknown) => {
          getLogger().warn(
            '[MQTT Module] Cleared qualification malfunction signal retained locally for retry',
            'mqtt',
            { error: error instanceof Error ? error.message : String(error) },
          );
        });
        return toQualificationMalfunctionSignalPayload(getLaneId(), state);
      },

      getEstComplaintSignal: async () => toEstComplaintSignalPayload(getLaneId(), estComplaintSignalService.getState()),
      getEstComplaintContext: () => estComplaintContextSource.capture(),

      declareEstComplaint: async (input) => {
        const context = await estComplaintContextSource.capture();
        const state = estComplaintSignalService.signal({
          issue: input.issue,
          context,
          message: input.message,
        });
        await estComplaintSignalPublisher.publishCurrentState().catch((error: unknown) => {
          getLogger().warn('[MQTT Module] EST complaint signal retained locally for retry', 'mqtt', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        return toEstComplaintSignalPayload(getLaneId(), state);
      },

      clearEstComplaintSignal: async (input) => {
        const state = estComplaintSignalService.clear({ ...input, clearedBy: 'Lane user' });
        await estComplaintSignalPublisher.publishCurrentState().catch((error: unknown) => {
          getLogger().warn('[MQTT Module] Cleared EST complaint signal retained locally for retry', 'mqtt', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        return toEstComplaintSignalPayload(getLaneId(), state);
      },

      saveMqttSettings: async (input) => {
        settingsStore.saveMqttSettings(input);
        hardwarePublisher.setRuntimeLaneAlias(null);
        hardwarePublisher.publishState();
      },

      getMqttSettings: async () => settingsStore.getMqttSettings(),
    };

    ipcRouter.register(mqttContract, handlers);
  },
};

function toSafetyStateDto(state: ReturnType<import('@/main/modules/safety-stop').ILaneSafetyStopControl['getState']>) {
  return {
    status: state?.status ?? ('CLEAR' as const),
    safetyStopId: state?.safetyStopId ?? null,
    reason: state?.reason ?? null,
    stoppedBy: state?.stoppedBy ?? null,
    stoppedAt: state?.stoppedAt.toISOString() ?? null,
    timerSnapshot: state?.timerSnapshot
      ? {
          competitionId: state.timerSnapshot.competitionId,
          remainingSeconds: state.timerSnapshot.remainingSeconds,
          totalSeconds: state.timerSnapshot.totalSeconds,
          frozenAt: state.timerSnapshot.frozenAt.toISOString(),
        }
      : null,
    clearedBy: state?.clearedBy ?? null,
    clearanceReason: state?.clearanceReason ?? null,
    clearedAt: state?.clearedAt?.toISOString() ?? null,
  };
}

function toRangeOfficerRequestDto(
  laneId: string,
  state: ReturnType<import('@/main/modules/range-officer-request').RangeOfficerRequestService['getState']>,
) {
  return {
    schemaVersion: 1 as const,
    laneId,
    status: state?.status ?? ('CLEARED' as const),
    requestId: state?.requestId ?? null,
    category: state?.category ?? null,
    message: state?.message ?? null,
    requestedAt: state?.requestedAt.toISOString() ?? null,
    clearedAt: state?.clearedAt?.toISOString() ?? null,
    clearedBy: state?.clearedBy ?? null,
    publishedAt: new Date().toISOString(),
  };
}

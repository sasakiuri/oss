// SPDX-License-Identifier: MIT
import type { InferHandlers } from '@sasakiuri/saika-ipc';
import { AthleteSchema } from '@sasakiuri/saika-protocol/LaneAssignment';
import { app } from 'electron';

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { toLaneSafetyStateDto } from '@/main/modules/safety-stop';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { errorMessage } from '@/shared/errors/errorMessage';
import { mqttContract } from '@/shared/ipc/contracts';

import { AssignedFinalRecoveryFiringContextSource } from './application/AssignedFinalRecoveryFiringContextSource';
import { AssignedMalfunctionFiringContextSource } from './application/AssignedMalfunctionFiringContextSource';
import { BroadcastCommandHandler } from './application/commands/BroadcastCommandHandler';
import { CommandIdempotencyGuard } from './application/commands/CommandIdempotencyGuard';
import { LaneCommandProcessor } from './application/commands/LaneCommandProcessor';
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
import { MqttConnectionController } from './application/MqttConnectionController';
import {
  QualificationMalfunctionSignalPublisher,
  toQualificationMalfunctionSignalPayload,
} from './application/QualificationMalfunctionSignalPublisher';
import { QualificationRecoveryShotPublisher } from './application/QualificationRecoveryShotPublisher';
import { QualificationRecoveryStatePublisher } from './application/QualificationRecoveryStatePublisher';
import { RangeOfficerRequestPublisher, toRangeOfficerRequestPayload } from './application/RangeOfficerRequestPublisher';
import { RawShotPublisher } from './application/RawShotPublisher';
import { RetainPublisher } from './application/RetainPublisher';
import { RpcRequestHandler } from './application/RpcRequestHandler';
import { ShotObservationEvidencePublisher } from './application/ShotObservationEvidencePublisher';
import { TimedTargetStatePublisher } from './application/TimedTargetStatePublisher';
import { commandAuthorizationPolicyFromEnvironment } from './domain/CommandAuthorizationPolicy';
import { MqttClientService } from './infra/MqttClientService';

type MqttDeps =
  | 'membership'
  | 'startup'
  | 'eventBus'
  | 'ipcRouter'
  | 'storage'
  | 'settingsStore'
  | 'queryBus'
  | 'commandBus'
  | 'competitionRepository'
  | 'competitionTypes'
  | 'timerService'
  | 'competitionInterruptionControl'
  | 'competitionShootOffControl'
  | 'qualificationRecoveryControl'
  | 'qualificationRecoveryAdjudicationControl'
  | 'qualificationRecoverySettlementControl'
  | 'safetyStopControl'
  | 'createReserveTransferControl'
  | 'createMalfunctionFiringControl'
  | 'rangeOfficerRequestService'
  | 'qualificationMalfunctionSignalService'
  | 'estComplaintSignalService'
  | 'timingProfileService'
  | 'timedTargetControl'
  | 'qualificationRecoveryShotOutbox'
  | 'competitionShootOffShotOutbox'
  | 'shotObservationEvidenceOutbox'
  | 'sessionRepository';

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
    'membership',
    'startup',
    'eventBus',
    'ipcRouter',
    'storage',
    'settingsStore',
    'queryBus',
    'commandBus',
    'competitionRepository',
    'competitionTypes',
    'timerService',
    'competitionInterruptionControl',
    'competitionShootOffControl',
    'qualificationRecoveryControl',
    'qualificationRecoveryAdjudicationControl',
    'qualificationRecoverySettlementControl',
    'safetyStopControl',
    'createReserveTransferControl',
    'createMalfunctionFiringControl',
    'rangeOfficerRequestService',
    'qualificationMalfunctionSignalService',
    'estComplaintSignalService',
    'timedTargetControl',
    'qualificationRecoveryShotOutbox',
    'competitionShootOffShotOutbox',
    'shotObservationEvidenceOutbox',
    'timingProfileService',
    'sessionRepository',
  ] as const,
  register({
    membership,
    startup,
    eventBus,
    ipcRouter,
    storage,
    settingsStore,
    queryBus,
    commandBus,
    competitionRepository,
    competitionTypes,
    timerService,
    competitionInterruptionControl,
    competitionShootOffControl,
    qualificationRecoveryControl,
    qualificationRecoveryAdjudicationControl,
    qualificationRecoverySettlementControl,
    safetyStopControl,
    createReserveTransferControl,
    createMalfunctionFiringControl,
    rangeOfficerRequestService,
    qualificationMalfunctionSignalService,
    estComplaintSignalService,
    timedTargetControl,
    qualificationRecoveryShotOutbox,
    competitionShootOffShotOutbox,
    shotObservationEvidenceOutbox,
    timingProfileService,
    sessionRepository,
  }) {
    const mqttClient = new MqttClientService();
    const appVersion = app.getVersion();
    const getLaneId = (): string => settingsStore.getLaneId();
    const rulePacks = competitionTypes
      .getAll()
      .flatMap((definition) => (definition.rulePackIdentity ? [definition.rulePackIdentity] : []));
    const commandAuthorization = commandAuthorizationPolicyFromEnvironment(process.env);
    const mqttCredentials = mqttCredentialsFromEnvironment(process.env);

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
      competitionShootOffShotOutbox,
    );
    new QualificationRecoveryShotPublisher(
      mqttClient,
      eventBus,
      storage,
      qualificationRecoveryControl,
      qualificationRecoveryShotOutbox,
    );
    new RawShotPublisher(mqttClient, eventBus, storage);
    new ShotObservationEvidencePublisher(mqttClient, eventBus, storage, shotObservationEvidenceOutbox);

    // Initialize competition publishers
    const competitionStatePublisher = new LaneCompetitionStatePublisher(
      mqttClient,
      eventBus,
      storage,
      competitionRepository,
      (competitionId) => competitionInterruptionControl.get(competitionId),
      () => startup.isReady(),
    );
    const scorePublisher = new LaneScorePublisher(
      mqttClient,
      eventBus,
      storage,
      competitionRepository,
      sessionRepository,
      () => startup.isReady(),
    );
    new CompetitionShotPublisher(
      mqttClient,
      eventBus,
      storage,
      competitionRepository,
      sessionRepository,
      competitionShootOffControl,
    );
    const assignmentPublisher = new LaneAssignmentPublisher(mqttClient, storage, getLaneId);
    const reserveTransferControl = createReserveTransferControl({
      read: (competitionId) => assignmentPublisher.getCurrentAssignment(competitionId),
      restore: async (competitionId, json) => {
        await assignmentPublisher.assign(
          competitionId,
          json === null ? null : AthleteSchema.parse(JSON.parse(json).athlete),
        );
      },
    });
    const mayFire = () => !safetyStopControl.isStopped();
    const finalRecoveryFiringContext = new AssignedFinalRecoveryFiringContextSource(
      competitionRepository,
      assignmentPublisher,
      mayFire,
    );
    const malfunctionFiringContext = new AssignedMalfunctionFiringContextSource(
      competitionRepository,
      assignmentPublisher,
      mayFire,
    );
    const malfunctionFiringControl = createMalfunctionFiringControl({
      prepare: (request) =>
        request.workflow === 'FINAL_RECOVERY'
          ? finalRecoveryFiringContext.prepare(request)
          : malfunctionFiringContext.prepare(request),
    });
    eventBus.on('MqttConnected', (event) => {
      if (startup.isReady() && !event.error) malfunctionFiringControl.restore();
    });
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
    const retainPublisher = new RetainPublisher({
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
      qualificationMalfunctionSignalPublisher,
      estComplaintSignalPublisher,
      timedTargetStatePublisher,
      qualificationRecoveryStatePublisher,
      excludeCompetitionShotReplay: (shotId) => qualificationRecoveryShotOutbox.hasShot(shotId),
      canPublishCompetition: () => startup.isReady(),
    });

    // Initialize RPC handler
    const rpcHandler = new RpcRequestHandler(mqttClient, storage, queryBus);

    // Initialize competition state subscriber
    const competitionStateSubscriber = new CompetitionStateSubscriber(
      mqttClient,
      commandBus,
      competitionRepository,
      undefined,
      (competitionTypeId) => competitionTypes.get(competitionTypeId),
    );
    const competitionCueSubscriber = new CompetitionCueSubscriber(mqttClient, eventBus, getLaneId);

    // One receive boundary validates, authorizes and deduplicates every command handler's deliveries.
    const processor = new LaneCommandProcessor({
      mqttClient,
      idempotencyGuard: new CommandIdempotencyGuard(),
      commandAuthorization,
      getLaneId,
      isReady: () => startup.isReady(),
    });

    const broadcastHandler = new BroadcastCommandHandler({
      mqttClient,
      processor,
      commandBus,
      timerService,
      competitionRepository,
      competitionStatePublisher,
      scorePublisher,
      getLaneId,
      interruptionControl: competitionInterruptionControl,
      safetyStopControl,
      shootOffControl: competitionShootOffControl,
      timedTargetControl,
    });

    const perLaneHandler = new PerLaneCommandHandler({
      mqttClient,
      processor,
      commandBus,
      competitionRepository,
      assignmentPublisher,
      scorePublisher,
      competitionStatePublisher,
      interruptionControl: competitionInterruptionControl,
      getLaneId,
      safetyStopControl,
      qualificationRecoveryControl,
      qualificationRecoveryStatePublisher,
      qualificationRecoveryAdjudicationControl,
      qualificationRecoverySettlementControl,
      malfunctionFiringControl,
      reserveTransferControl,
      replayTransferredSession: (competitionId) => retainPublisher.replayTransferredSession(competitionId),
    });

    const tier1Handler = new LaneTier1CommandHandler({
      mqttClient,
      processor,
      broadcastHandler,
      perLaneHandler,
      rpcHandler,
      competitionStateSubscriber,
      competitionCueSubscriber,
      retainPublisher,
      membership,
      getLaneId,
      safetyStopControl,
      safetyStatePublisher,
      competitionShootOffControl,
      timedTargetControl,
    });

    const connection = new MqttConnectionController({
      mqttClient,
      settingsStore,
      eventBus,
      isReady: () => startup.isReady(),
      credentials: mqttCredentials,
      hardwarePublisher,
      safetyStatePublisher,
      readyStatePublishers: [
        rangeOfficerRequestPublisher,
        qualificationMalfunctionSignalPublisher,
        estComplaintSignalPublisher,
        timedTargetStatePublisher,
        qualificationRecoveryStatePublisher,
      ],
      tier1Handler,
      retainPublisher,
    });
    startup.afterReady(() => connection.afterReady());
    const handlers: InferHandlers<typeof mqttContract> = {
      connectMqtt: (input) => connection.connect(input),
      disconnectMqtt: () => connection.disconnect(),
      getMqttStatus: async () => connection.status(),

      getDirectorMembership: async () => membership.snapshot,

      getSafetyState: async () => toLaneSafetyStateDto(safetyStopControl.getState()),

      getRangeOfficerRequest: async () =>
        toRangeOfficerRequestPayload(getLaneId(), rangeOfficerRequestService.getState()),

      requestRangeOfficer: async (input) => {
        const state = rangeOfficerRequestService.request(input);
        await publishRetainedOrWarn(
          rangeOfficerRequestPublisher,
          '[MQTT Module] Range Officer request retained locally for retry',
        );
        return toRangeOfficerRequestPayload(getLaneId(), state);
      },

      clearRangeOfficerRequest: async (input) => {
        const state = rangeOfficerRequestService.clear({ ...input, clearedBy: 'Lane user' });
        await publishRetainedOrWarn(
          rangeOfficerRequestPublisher,
          '[MQTT Module] Cleared Range Officer request retained locally for retry',
        );
        return toRangeOfficerRequestPayload(getLaneId(), state);
      },

      getQualificationMalfunctionSignal: async () =>
        toQualificationMalfunctionSignalPayload(getLaneId(), qualificationMalfunctionSignalService.getState()),

      declareQualificationMalfunction: async (input) => {
        const context = await qualificationMalfunctionContextSource.capture();
        const state = qualificationMalfunctionSignalService.signal({ context, message: input.message });
        await publishRetainedOrWarn(
          qualificationMalfunctionSignalPublisher,
          '[MQTT Module] Qualification malfunction signal retained locally for retry',
        );
        return toQualificationMalfunctionSignalPayload(getLaneId(), state);
      },

      clearQualificationMalfunctionSignal: async (input) => {
        const state = qualificationMalfunctionSignalService.clear({ ...input, clearedBy: 'Lane user' });
        await publishRetainedOrWarn(
          qualificationMalfunctionSignalPublisher,
          '[MQTT Module] Cleared qualification malfunction signal retained locally for retry',
        );
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
        await publishRetainedOrWarn(
          estComplaintSignalPublisher,
          '[MQTT Module] EST complaint signal retained locally for retry',
        );
        return toEstComplaintSignalPayload(getLaneId(), state);
      },

      clearEstComplaintSignal: async (input) => {
        const state = estComplaintSignalService.clear({ ...input, clearedBy: 'Lane user' });
        await publishRetainedOrWarn(
          estComplaintSignalPublisher,
          '[MQTT Module] Cleared EST complaint signal retained locally for retry',
        );
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

/** Keeps a Lane-owned signal locally when its retained publication fails; the reconnect republish retries it. */
function publishRetainedOrWarn(publisher: { publishCurrentState(): Promise<void> }, message: string): Promise<void> {
  return publisher.publishCurrentState().catch((error: unknown) => {
    getLogger().warn(message, 'mqtt', { error: errorMessage(error) });
  });
}

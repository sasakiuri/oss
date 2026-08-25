// SPDX-License-Identifier: MIT
/**
 * MQTT module definition
 *
 * Handles initialization of MqttClientService, starting publishers, and registering command handlers and IPC handlers.
 */

import { app } from 'electron';

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { mqttContract } from '@/shared/ipc/contracts';
import type { MqttSettings } from '@/shared/ipc/contracts/mqtt.contract';
import type { InferHandlers } from '@/shared/ipc/defineContract';

import { BroadcastCommandHandler } from './application/commands/BroadcastCommandHandler';
import { LaneTier1CommandHandler } from './application/commands/LaneTier1CommandHandler';
import { PerLaneCommandHandler } from './application/commands/PerLaneCommandHandler';
import { CompetitionShotPublisher } from './application/CompetitionShotPublisher';
import { CompetitionStateSubscriber } from './application/CompetitionStateSubscriber';
import { HardwareStatePublisher } from './application/HardwareStatePublisher';
import { LaneAssignmentPublisher } from './application/LaneAssignmentPublisher';
import { LaneCompetitionStatePublisher } from './application/LaneCompetitionStatePublisher';
import { LaneScorePublisher } from './application/LaneScorePublisher';
import { RawShotPublisher } from './application/RawShotPublisher';
import { RetainPublisher } from './application/RetainPublisher';
import { RpcRequestHandler } from './application/RpcRequestHandler';
import { CommandIdempotencyGuard } from './infra/CommandIdempotencyGuard';
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
  | 'sessionRepository';

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
    'sessionRepository',
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
    sessionRepository,
  }) {
    const mqttClient = new MqttClientService();
    const appVersion = app.getVersion();
    const idempotencyGuard = new CommandIdempotencyGuard();
    const getLaneId = (): string => settingsStore.getLaneId();

    // Initialize publishers (they subscribe to EventBus events)
    const hardwarePublisher = new HardwareStatePublisher(mqttClient, eventBus, storage, appVersion);
    new RawShotPublisher(mqttClient, eventBus, storage);

    // Initialize competition publishers
    const competitionStatePublisher = new LaneCompetitionStatePublisher(
      mqttClient,
      eventBus,
      storage,
      competitionRepository,
    );
    const scorePublisher = new LaneScorePublisher(mqttClient, eventBus, storage, competitionRepository, queryBus);
    new CompetitionShotPublisher(mqttClient, eventBus, storage, competitionRepository);
    const assignmentPublisher = new LaneAssignmentPublisher(mqttClient, storage, getLaneId);

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
    );

    // Initialize RPC handler
    const rpcHandler = new RpcRequestHandler(mqttClient, storage, queryBus);

    // Initialize competition state subscriber
    const competitionStateSubscriber = new CompetitionStateSubscriber(mqttClient, commandBus, competitionRepository);

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
    );

    const perLaneHandler = new PerLaneCommandHandler(
      mqttClient,
      commandBus,
      idempotencyGuard,
      competitionRepository,
      assignmentPublisher,
      scorePublisher,
      getLaneId,
      competitionId,
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
          });

          // Register reconnect callbacks (must be after connect so onConnect/onDisconnect work)
          retainPublisher.registerCallbacks(true);

          // Publish initial state
          hardwarePublisher.resumePublishing();
          hardwarePublisher.publishState();
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

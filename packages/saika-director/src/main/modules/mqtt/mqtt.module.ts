// SPDX-License-Identifier: MIT
import { networkInterfaces } from 'node:os';

import type { ModuleDefinition, ModuleOutput } from '@/main/shared-infra/module/ModuleDefinition';
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import type {
  DebugLogEmitted,
  LaneConnected,
  MqttConnectionError,
  MqttControlStateChanged,
  ShotReceived,
} from './domain/events';
import { EmbeddedMqttBroker } from './infra/EmbeddedMqttBroker';
import { SqliteMqttRetainedMessageStore } from './infra/SqliteMqttRetainedMessageStore';
import {
  DirectorMqttService,
  sanitizeBrokerUrl,
  type CompetitionResultLane,
  type MqttControlSnapshot,
} from './infra/DirectorMqttService';
import { FiringPointNumberResolver } from './application/FiringPointNumberResolver';
import { PublishMqttResultsToken } from '@/main/modules/results';
import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import type { PublishResultsResponse } from '@/shared/ipc/contracts/results.contract';
import { mqttContract, eventsContract, type MqttControlSnapshotDto } from '@/shared/ipc/contracts';
import { Logger } from '@/shared/utils/Logger';

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

interface RuntimeBrokerConfig {
  mode: 'embedded' | 'external';
  url: string;
  port: number;
}

function getLaneCompetitionMetadata(competitionTypeId: string): {
  discipline: string;
  acc: 'RING' | 'DECIMAL';
} {
  switch (competitionTypeId) {
    case 'BR60S':
      return { discipline: 'BEAM_RIFLE_10M', acc: 'DECIMAL' };
    case 'BP60':
      return { discipline: 'BEAM_PISTOL_10M', acc: 'RING' };
    default:
      throw new Error(`Competition type ${competitionTypeId} is not supported by the current Saika Lane MQTT API`);
  }
}

export const mqttModule: ModuleDefinition<
  | 'database'
  | 'eventBus'
  | 'commandBus'
  | 'queryBus'
  | 'ipcRouter'
  | 'debugLogStore'
  | 'appConfigService'
  | 'competitionTypeRegistry'
  | 'laneControlRepository'
> = {
  name: 'mqtt',
  deps: [
    'database',
    'eventBus',
    'commandBus',
    'queryBus',
    'ipcRouter',
    'debugLogStore',
    'appConfigService',
    'competitionTypeRegistry',
    'laneControlRepository',
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
    } = ctx;

    const retainedMessageStore = new SqliteMqttRetainedMessageStore(database);
    let embeddedMqttBroker = new EmbeddedMqttBroker(
      { port: appConfigService.get('mqtt.broker.port') },
      retainedMessageStore,
    );
    const firingPointNumberResolver = new FiringPointNumberResolver();
    const announcedChannelByLaneId = new Map<string, number>();

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

    const mqttService = new DirectorMqttService(
      {
        directorId: appConfigService.get('mqtt.director.id'),
        commandTimeoutMs: appConfigService.get('mqtt.commandTimeoutMs'),
        startDelayMs: appConfigService.get('mqtt.startDelayMs'),
      },
      {
        onStateChanged: handleSnapshot,
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
            score: shot.rawScoreX10 / 10,
            seriesNumber: shot.seriesIndex + 1,
          });
        },
        onDebugLog: addDebugLog,
        onSessionReset: () => {
          firingPointNumberResolver.reset();
          announcedChannelByLaneId.clear();
        },
        onError: (message) => {
          eventBus.emit({
            type: 'MqttConnectionError',
            timestamp: Date.now(),
            message,
          });
        },
      },
    );

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
        embeddedMqttBroker = new EmbeddedMqttBroker({ port: config.port }, retainedMessageStore);
      }
      if (config.mode === 'embedded' && !embeddedMqttBroker.running) {
        await embeddedMqttBroker.start();
      }

      await mqttService.connect(getBrokerUrl(config.mode, config.port, config.url));
    };

    const reconnectClient = async (): Promise<void> => {
      await connectClient(readBrokerConfig());
    };

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
      createCompetition: (input) =>
        runWithControlLock(async () => {
          const definition = competitionTypeRegistry.get(input.competitionTypeId);
          if (definition.config.name !== 'Qualification') {
            throw new Error('The current Saika Lane MQTT API supports qualification rounds only');
          }
          const metadata = getLaneCompetitionMetadata(definition.id);
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
        runWithControlLock(() => mqttService.leaveCompetition(input.competitionId, input.laneIds)),
      assignAthlete: (input) =>
        runWithControlLock(() => mqttService.assignAthlete(input.competitionId, input.laneId, input.athlete)),
      resetSession: (input) =>
        runWithControlLock(() => mqttService.resetSession(input.competitionId, input.laneId, input.reason)),
      startSighting: (input) =>
        runWithControlLock(() =>
          mqttService.startSighting(input.competitionId, input.durationSeconds, input.targetLaneIds),
        ),
      endSighting: (input) => runWithControlLock(() => mqttService.endSighting(input.competitionId)),
      startMatch: (input) =>
        runWithControlLock(() => mqttService.startMatch(input.competitionId, input.durationSeconds)),
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
        runWithControlLock(() =>
          mqttService.advanceSeries(input.competitionId, input.stageIndex, input.fromSeriesIndex, input.resumeOnly),
        ),
      finishCompetition: (input) =>
        runWithControlLock(async () => {
          const competition = mqttService
            .getSnapshot()
            .competitions.find((state) => state.competitionId === input.competitionId);
          if (!competition) throw new Error(`Competition not found: ${input.competitionId}`);

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
                  resultPublication = await commandBus.execute(PublishMqttResultsToken, {
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
          const result = await mqttService.finishCompetition(input.competitionId, beforeCleanup);
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
      ],
    };
  },
};

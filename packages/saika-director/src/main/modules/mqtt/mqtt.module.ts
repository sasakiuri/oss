// SPDX-License-Identifier: MIT
import { OperationalProfileService, directorOperationalPresets } from '@/main/modules/operational-profiles';
import { ReserveTransferDataGuard, SqliteReserveTransferRepository } from '@/main/modules/reserve-lane-transfers';
import { defineModule, type ModuleOutput } from '@/main/shared-infra/module/ModuleDefinition';
import { RuntimeOperationGate } from '@/main/shared-infra/operations/RuntimeOperationGate';
import { mqttContract } from '@/shared/ipc/contracts';
import { operationalProfilesContract } from '@/shared/ipc/contracts';
import { Logger } from '@/shared/logging';

import { createCompetitionControlHandlers } from './application/createCompetitionControlHandlers';
import { createFinalControlHandlers } from './application/createFinalControlHandlers';
import { createSafetyControlHandlers } from './application/createSafetyControlHandlers';
import { sanitizeBrokerUrl } from './application/DirectorMqttConnection';
import { DirectorMqttService } from './application/DirectorMqttService';
import type { MqttControlSnapshot } from './application/DirectorMqttTypes';
import { mqttEventForwarding } from './application/mqttEventForwarding';
import { MqttObservationRecorder } from './application/MqttObservationRecorder';
import { createOperationalProfileTargets } from './application/operationalProfileTargets';
import { registerMqttTransportCommands } from './application/registerMqttTransportCommands';
import { toFiringWindowViolationDto } from './application/toFiringWindowViolationDto';
import { ClockQualityPolicy, type ClockQualityAssessment } from './domain/ClockQualityPolicy';
import { embeddedMqttSecurityFromEnvironment } from './domain/EmbeddedMqttAccessPolicy';
import type { MqttCredentials } from './domain/IMqttTransport';
import { LaneTimingEvidencePolicy } from './domain/LaneTimingEvidencePolicy';
import { SafetyStopClearancePolicy } from './domain/SafetyStopClearancePolicy';
import { TimedTargetReadinessPolicy } from './domain/TimedTargetReadinessPolicy';
import { BrokerRuntime } from './infra/BrokerRuntime';
import { MqttTransport } from './infra/MqttTransport';
import { SqliteMqttRetainedMessageStore } from './infra/SqliteMqttRetainedMessageStore';
import { SqliteSafetyStopAuditJournal } from './infra/SqliteSafetyStopAuditJournal';

const logger = Logger.create('mqtt.module');

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

export const mqttModule = defineModule({
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
  ],
  register(ctx): ModuleOutput {
    const {
      database,
      eventBus,
      commandBus,
      queryBus,
      ipcRouter,
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
    const reserveTransferGuard = new ReserveTransferDataGuard(new SqliteReserveTransferRepository(database));

    const recorder = new MqttObservationRecorder({
      eventBus,
      competitionTypeRegistry,
      laneControlRepository,
      competitionShotJournal,
      firingWindowJournal,
      shotObservationEvidenceJournal,
      finalOperationService,
      readSnapshot: (): MqttControlSnapshot => mqttService.getSnapshot(),
    });

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
          reserveTransferGuard.assertAllowed({ competitionId, operation: 'CLEAR_COMPETITION_DATA' }),
        ...recorder.callbacks,
      },
      new MqttTransport(),
      new ClockQualityPolicy(readClockQualitySettings()),
    );
    mqttService.setTimingEvidencePolicy(
      new LaneTimingEvidencePolicy(() => appConfigService.get('timingEvidence.mode')),
    );
    mqttService.setTimedTargetReadinessPolicy(new TimedTargetReadinessPolicy(readTimedTargetReadinessSettings));

    const brokerRuntime = new BrokerRuntime({
      client: mqttService,
      readConfig: () => ({
        mode: appConfigService.get('mqtt.broker.mode'),
        url: appConfigService.get('mqtt.broker.url'),
        port: appConfigService.get('mqtt.broker.port'),
      }),
      saveConfig: (config) =>
        appConfigService.setMany({
          'mqtt.broker.mode': config.mode,
          'mqtt.broker.url': config.url,
          'mqtt.broker.port': config.port,
        }),
      security: embeddedBrokerSecurity,
      retainedMessageStore,
    });

    const requireCompetition = (competitionId: string) => {
      const competition = mqttService.getSnapshot().competitions.find((state) => state.competitionId === competitionId);
      if (!competition) throw new Error(`Competition not found: ${competitionId}`);
      return competition;
    };

    const operationGate = new RuntimeOperationGate();
    const runWithRuntimeLock = operationGate.runTransition;
    const runWithControlLock = operationGate.runControl;

    registerMqttTransportCommands({
      commandBus,
      mqttService,
      runWithControlLock,
      competitionTypeRegistry,
      requireCompetition,
    });

    const operationalProfiles = new OperationalProfileService(
      createOperationalProfileTargets({
        composedTargets: ctx.operationalSettingTargets,
        relayReadiness: ctx.relayReadinessService,
        estInspection: ctx.estInspectionStartService,
        config: appConfigService,
        readClockQualitySettings,
        applyClockQualityPolicy: (policy) => mqttService.setClockQualityPolicy(policy),
        readTimedTargetReadinessSettings,
        hasActiveCompetition: () =>
          mqttService
            .getSnapshot()
            .competitions.some((competition) => !['NOT_STARTED', 'MATCH_COMPLETE'].includes(competition.phase)),
      }),
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
      getBrokerConfig: () => runWithRuntimeLock(async () => brokerRuntime.readConfig()),
      setBrokerConfig: (input) => runWithRuntimeLock(() => brokerRuntime.reconfigure(input)),
      getBrokerStatus: () => runWithRuntimeLock(async () => brokerRuntime.status()),
      startBroker: () => runWithRuntimeLock(() => brokerRuntime.startBroker()),
      stopBroker: () => runWithRuntimeLock(() => brokerRuntime.stopBroker()),
      connect: () => runWithRuntimeLock(() => brokerRuntime.reconnect()),
      disconnect: () => runWithRuntimeLock(() => mqttService.disconnect()),
      getControlState: async () => recorder.toControlSnapshotDto(mqttService.getSnapshot()),
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
          start: () => runWithRuntimeLock(() => brokerRuntime.startConfiguredBroker()),
          stop: () => runWithRuntimeLock(() => brokerRuntime.stopEmbeddedBroker()),
        },
        {
          name: 'DirectorMqttService',
          start: () =>
            runWithRuntimeLock(async () => {
              try {
                await brokerRuntime.reconnect();
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
      eventForwarding: mqttEventForwarding,
    };
  },
});

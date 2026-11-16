// SPDX-License-Identifier: MIT
/** Forwards domain events to the renderer using the channels in eventsContract. */

import type { BrowserWindow } from 'electron';
import type { z } from 'zod';

import type { ShotDto } from '@/main/modules/session/application/dto';
import type { Shot } from '@/main/modules/session/domain/Shot';
import { toTimedTargetStateDto } from '@/main/modules/timed-target/toTimedTargetStateDto';
import type {
  CompetitionFinishedEvent,
  CompetitionCueChangedEvent,
  CompetitionInterruptionChangedEvent,
  CompetitionStartedEvent,
  CompetitionProgressChangedEvent,
  ConnectionEstablishedEvent,
  ConnectionLostEvent,
  ModeSwitchedEvent,
  DirectorMembershipChangedEvent,
  MqttConnectedEvent,
  MqttDisconnectedEvent,
  PhaseChangedEvent,
  SeriesCompletedEvent,
  SafetyStopChangedEvent,
  SessionResetEvent,
  SessionStartedEvent,
  ShotRecordedEvent,
  PositionExtraNullifiedEvent,
  ShotRecordingFailedEvent,
  StageAdvancedEvent,
  TimerExpiredEvent,
  TimerTickEvent,
  TimedTargetSequenceChangedEvent,
} from '@/main/shared-infra/events/coreEvents';
import type { EventName } from '@/main/shared-infra/events/EventBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ConnectionStatusChangedEventPayload, MqttStatusChangedEventPayload } from '@/shared/ipc/contracts';
import { eventsContract } from '@/shared/ipc/contracts';

type EventKey = keyof typeof eventsContract.events;

export class ContractEventForwarder {
  private readonly unsubscribers: (() => void)[] = [];

  constructor(
    private readonly eventBus: IEventBus,
    private readonly mainWindow: BrowserWindow,
  ) {}

  start(): void {
    this.forward('PositionExtraNullified', 'positionExtraNullified', (event: PositionExtraNullifiedEvent) => ({
      sessionId: event.aggregateId,
      competitionId: event.competitionId,
      ...(event.resetError ? { resetError: event.resetError } : {}),
    }));
    this.forward('ShotRecordingFailed', 'error', (event: ShotRecordingFailedEvent) => ({
      code: 'SHOT_PROGRESS_FAILED',
      message: event.message,
      userMessage: event.message,
      severity: 'error',
    }));
    // ShotRecorded → event:shotRecorded
    this.forward('ShotRecorded', 'shotRecorded', (event: ShotRecordedEvent) => ({
      sessionId: event.aggregateId,
      shot: { ...this.transformShot(event.shot), reportedMode: event.reportedMode ?? null },
    }));

    // ConnectionEstablished → event:connectionStatusChanged
    this.forward(
      'ConnectionEstablished',
      'connectionStatusChanged',
      (event: ConnectionEstablishedEvent): ConnectionStatusChangedEventPayload => ({
        connectionId: event.aggregateId,
        status: 'connected',
        manufacturer: event.manufacturer.value as ConnectionStatusChangedEventPayload['manufacturer'],
        portPath: event.portPath,
        deviceId: event.deviceId,
      }),
    );

    // ConnectionLost → event:connectionStatusChanged
    this.forward(
      'ConnectionLost',
      'connectionStatusChanged',
      (event: ConnectionLostEvent): ConnectionStatusChangedEventPayload => ({
        connectionId: event.aggregateId,
        status: 'disconnected',
        reason: event.reason,
      }),
    );

    // SessionStarted → event:sessionStarted
    this.forward('SessionStarted', 'sessionStarted', (event: SessionStartedEvent) => ({
      sessionId: event.aggregateId,
      discipline: event.discipline.value,
    }));

    // ModeSwitched → event:modeSwitched
    this.forward('ModeSwitched', 'modeSwitched', (event: ModeSwitchedEvent) => ({
      sessionId: event.aggregateId,
      mode: event.newMode.value,
    }));

    // SessionReset → event:sessionReset
    this.forward('SessionReset', 'sessionReset', (event: SessionResetEvent) => ({
      sessionId: event.aggregateId,
    }));

    // CompetitionStarted → event:competitionStarted
    this.forward('CompetitionStarted', 'competitionStarted', (event: CompetitionStartedEvent) => ({
      competitionId: event.aggregateId,
      competitionTypeId: event.competitionTypeId,
      sessionId: event.sessionId,
      config: event.config,
      shotsPerSeries: event.config.shotsPerSeries,
      acc: event.config.acc,
    }));

    // PhaseChanged → event:phaseChanged
    this.forward('PhaseChanged', 'phaseChanged', (event: PhaseChangedEvent) => ({
      previousPhase: event.previousPhase,
      newPhase: event.newPhase,
      stageIndex: event.stageIndex,
      seriesIndex: event.seriesIndex,
      stageName: event.stageName,
      scored: event.scored,
      targetProfileId: event.targetProfileId,
      scoringGaugeProfileId: event.scoringGaugeProfileId,
    }));

    this.forward(
      'CompetitionProgressChanged',
      'competitionProgressChanged',
      (event: CompetitionProgressChangedEvent) => ({
        competitionId: event.aggregateId,
        stageIndex: event.stageIndex,
        seriesIndex: event.seriesIndex,
        shotCount: event.shotCount,
      }),
    );

    // TimerTick → event:timerTick
    this.forward('TimerTick', 'timerTick', (event: TimerTickEvent) => ({
      remainingSeconds: event.remainingSeconds,
      totalSeconds: event.totalSeconds,
      formattedRemaining: event.formattedRemaining,
    }));

    // TimerExpired → event:timerExpired
    this.forward('TimerExpired', 'timerExpired', (event: TimerExpiredEvent) => ({
      stageIndex: event.stageIndex,
    }));

    this.forward(
      'CompetitionInterruptionChanged',
      'competitionInterruptionChanged',
      (event: CompetitionInterruptionChangedEvent) => ({
        competitionId: event.aggregateId,
        interruptionId: event.interruptionId,
        status: event.status,
        remainingSeconds: event.remainingSeconds,
        unlimitedSightingShots: event.unlimitedSightingShots,
        remainingTimeVerified: event.remainingTimeVerified,
      }),
    );

    this.forward('SafetyStopChanged', 'safetyStopChanged', (event: SafetyStopChangedEvent) => ({
      status: event.status,
      safetyStopId: event.safetyStopId,
      reason: event.reason,
      stoppedBy: event.stoppedBy,
      stoppedAt: new Date(event.stoppedAt).toISOString(),
      timerSnapshot:
        event.competitionId && event.remainingSeconds !== null && event.totalSeconds !== null
          ? {
              competitionId: event.competitionId,
              remainingSeconds: event.remainingSeconds,
              totalSeconds: event.totalSeconds,
              frozenAt: new Date(event.frozenAt ?? event.timestamp).toISOString(),
            }
          : null,
      clearedBy: event.clearedBy,
      clearanceReason: event.clearanceReason,
      clearedAt: event.clearedAt === null ? null : new Date(event.clearedAt).toISOString(),
    }));

    this.forward('CompetitionCueChanged', 'competitionCueChanged', (event: CompetitionCueChangedEvent) => ({
      competitionId: event.aggregateId,
      cue: event.cue,
    }));

    this.forward('TimedTargetSequenceChanged', 'timedTargetSequenceChanged', (event: TimedTargetSequenceChangedEvent) =>
      toTimedTargetStateDto(event.state),
    );

    // SeriesCompleted → event:seriesCompleted
    this.forward('SeriesCompleted', 'seriesCompleted', (event: SeriesCompletedEvent) => ({
      stageIndex: event.stageIndex,
      seriesIndex: event.seriesIndex,
      shotCount: event.shotCount,
    }));

    // StageAdvanced → event:stageAdvanced
    this.forward('StageAdvanced', 'stageAdvanced', (event: StageAdvancedEvent) => ({
      previousStageIndex: event.previousStageIndex,
      newStageIndex: event.newStageIndex,
      stageName: event.stageName,
      scored: event.scored,
    }));

    // CompetitionFinished → event:competitionFinished
    this.forward('CompetitionFinished', 'competitionFinished', (event: CompetitionFinishedEvent) => ({
      sessionId: event.sessionId,
    }));

    this.forward('DirectorMembershipChanged', 'directorMembershipChanged', (event: DirectorMembershipChangedEvent) => ({
      competitionId: event.competitionId,
      revision: event.revision,
    }));

    // MqttConnected → event:mqttStatusChanged
    this.forward('MqttConnected', 'mqttStatusChanged', (event: MqttConnectedEvent): MqttStatusChangedEventPayload => ({
      status: 'connected',
      ...(event.error ? { error: event.error } : {}),
      brokerUrl: event.brokerUrl,
      laneId: event.laneId,
    }));

    // MqttDisconnected → event:mqttStatusChanged
    this.forward(
      'MqttDisconnected',
      'mqttStatusChanged',
      (event: MqttDisconnectedEvent): MqttStatusChangedEventPayload => ({
        status: 'disconnected',
        ...(event.reason ? { error: event.reason } : {}),
      }),
    );
  }

  stop(): void {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers.length = 0;
  }

  /** Forwards one domain event; the payload type is the event's contract schema, which the preload bridge enforces. */
  private forward<E, K extends EventKey>(
    eventType: EventName,
    key: K,
    transform: (event: E) => z.input<(typeof eventsContract.events)[K]['schema']>,
  ): void {
    const channel = eventsContract.channels[key];
    const unsub = this.eventBus.on(eventType, (event: unknown) => {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, transform(event as E));
      }
    });
    this.unsubscribers.push(unsub);
  }

  private transformShot(shot: Shot): ShotDto {
    return {
      id: shot.id,
      shotNumber: shot.shotNumber,
      seriesNumber: shot.seriesNumber,
      x: shot.impactPoint !== null ? shot.impactPoint.x : null,
      y: shot.impactPoint !== null ? shot.impactPoint.y : null,
      score: shot.score.value,
      innerTen: shot.innerTen,
      timestamp: shot.timestamp.toISOString(),
      mode: shot.mode.value,
      isRecorded: shot.mode.isMatch(),
      receivedAt: shot.receivedAt.toISOString(),
      competitionContext: shot.competitionContext ?? null,
    };
  }
}

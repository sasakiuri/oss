// SPDX-License-Identifier: MIT
/** Forwards domain events to the renderer using the channels in eventsContract. */

import type { BrowserWindow } from 'electron';

import type { ShotDto } from '@/main/modules/session/application/dto';
import type { Shot } from '@/main/modules/session/domain/Shot';
import { toTimedTargetStateDto } from '@/main/modules/timed-target/toTimedTargetStateDto';
import type {
  CompetitionFinishedEvent,
  CompetitionCueChangedEvent,
  CompetitionInterruptionChangedEvent,
  CompetitionStartedEvent,
  ConnectionEstablishedEvent,
  ConnectionLostEvent,
  ModeSwitchedEvent,
  MqttConnectedEvent,
  MqttDisconnectedEvent,
  PhaseChangedEvent,
  SeriesCompletedEvent,
  SafetyStopChangedEvent,
  SessionResetEvent,
  SessionStartedEvent,
  ShotRecordedEvent,
  StageAdvancedEvent,
  TimerExpiredEvent,
  TimerTickEvent,
  TimedTargetSequenceChangedEvent,
} from '@/main/shared-infra/events/coreEvents';
import type { EventName } from '@/main/shared-infra/events/EventBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ConnectionStatusChangedEventPayload, MqttStatusChangedEventPayload } from '@/shared/ipc/contracts';
import { eventsContract } from '@/shared/ipc/contracts';

export class ContractEventForwarder {
  private readonly unsubscribers: (() => void)[] = [];

  constructor(
    private readonly eventBus: IEventBus,
    private readonly mainWindow: BrowserWindow,
  ) {}

  start(): void {
    // ShotRecorded → event:shotRecorded
    this.forward<ShotRecordedEvent>('ShotRecorded', eventsContract.channels.shotRecorded, (event) => ({
      sessionId: event.aggregateId,
      shot: this.transformShot(event.shot),
    }));

    // ConnectionEstablished → event:connectionStatusChanged
    this.forward<ConnectionEstablishedEvent>(
      'ConnectionEstablished',
      eventsContract.channels.connectionStatusChanged,
      (event): ConnectionStatusChangedEventPayload => ({
        connectionId: event.aggregateId,
        status: 'connected',
        manufacturer: event.manufacturer.value as ConnectionStatusChangedEventPayload['manufacturer'],
        portPath: event.portPath,
        deviceId: event.deviceId,
      }),
    );

    // ConnectionLost → event:connectionStatusChanged
    this.forward<ConnectionLostEvent>(
      'ConnectionLost',
      eventsContract.channels.connectionStatusChanged,
      (event): ConnectionStatusChangedEventPayload => ({
        connectionId: event.aggregateId,
        status: 'disconnected',
        reason: event.reason,
      }),
    );

    // SessionStarted → event:sessionStarted
    this.forward<SessionStartedEvent>('SessionStarted', eventsContract.channels.sessionStarted, (event) => ({
      sessionId: event.aggregateId,
      discipline: event.discipline.value,
    }));

    // ModeSwitched → event:modeSwitched
    this.forward<ModeSwitchedEvent>('ModeSwitched', eventsContract.channels.modeSwitched, (event) => ({
      sessionId: event.aggregateId,
      mode: event.newMode.value,
    }));

    // SessionReset → event:sessionReset
    this.forward<SessionResetEvent>('SessionReset', eventsContract.channels.sessionReset, (event) => ({
      sessionId: event.aggregateId,
    }));

    // CompetitionStarted → event:competitionStarted
    this.forward<CompetitionStartedEvent>(
      'CompetitionStarted',
      eventsContract.channels.competitionStarted,
      (event) => ({
        competitionId: event.aggregateId,
        competitionTypeId: event.competitionTypeId,
        sessionId: event.sessionId,
        config: event.config,
        shotsPerSeries: event.config.shotsPerSeries,
        acc: event.config.acc,
      }),
    );

    // PhaseChanged → event:phaseChanged
    this.forward<PhaseChangedEvent>('PhaseChanged', eventsContract.channels.phaseChanged, (event) => ({
      previousPhase: event.previousPhase,
      newPhase: event.newPhase,
      stageIndex: event.stageIndex,
      seriesIndex: event.seriesIndex,
      stageName: event.stageName,
      scored: event.scored,
      targetProfileId: event.targetProfileId,
      scoringGaugeProfileId: event.scoringGaugeProfileId,
    }));

    // TimerTick → event:timerTick
    this.forward<TimerTickEvent>('TimerTick', eventsContract.channels.timerTick, (event) => ({
      remainingSeconds: event.remainingSeconds,
      totalSeconds: event.totalSeconds,
      formattedRemaining: event.formattedRemaining,
    }));

    // TimerExpired → event:timerExpired
    this.forward<TimerExpiredEvent>('TimerExpired', eventsContract.channels.timerExpired, (event) => ({
      stageIndex: event.stageIndex,
    }));

    this.forward<CompetitionInterruptionChangedEvent>(
      'CompetitionInterruptionChanged',
      eventsContract.channels.competitionInterruptionChanged,
      (event) => ({
        competitionId: event.aggregateId,
        interruptionId: event.interruptionId,
        status: event.status,
        remainingSeconds: event.remainingSeconds,
        unlimitedSightingShots: event.unlimitedSightingShots,
      }),
    );

    this.forward<SafetyStopChangedEvent>('SafetyStopChanged', eventsContract.channels.safetyStopChanged, (event) => ({
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

    this.forward<CompetitionCueChangedEvent>(
      'CompetitionCueChanged',
      eventsContract.channels.competitionCueChanged,
      (event) => ({ competitionId: event.aggregateId, cue: event.cue }),
    );

    this.forward<TimedTargetSequenceChangedEvent>(
      'TimedTargetSequenceChanged',
      eventsContract.channels.timedTargetSequenceChanged,
      (event) => toTimedTargetStateDto(event.state),
    );

    // SeriesCompleted → event:seriesCompleted
    this.forward<SeriesCompletedEvent>('SeriesCompleted', eventsContract.channels.seriesCompleted, (event) => ({
      stageIndex: event.stageIndex,
      seriesIndex: event.seriesIndex,
      shotCount: event.shotCount,
    }));

    // StageAdvanced → event:stageAdvanced
    this.forward<StageAdvancedEvent>('StageAdvanced', eventsContract.channels.stageAdvanced, (event) => ({
      previousStageIndex: event.previousStageIndex,
      newStageIndex: event.newStageIndex,
      stageName: event.stageName,
      scored: event.scored,
    }));

    // CompetitionFinished → event:competitionFinished
    this.forward<CompetitionFinishedEvent>(
      'CompetitionFinished',
      eventsContract.channels.competitionFinished,
      (event) => ({
        sessionId: event.sessionId,
      }),
    );

    // MqttConnected → event:mqttStatusChanged
    this.forward<MqttConnectedEvent>(
      'MqttConnected',
      eventsContract.channels.mqttStatusChanged,
      (event): MqttStatusChangedEventPayload => ({
        status: 'connected',
        brokerUrl: event.brokerUrl,
        laneId: event.laneId,
      }),
    );

    // MqttDisconnected → event:mqttStatusChanged
    this.forward<MqttDisconnectedEvent>(
      'MqttDisconnected',
      eventsContract.channels.mqttStatusChanged,
      (): MqttStatusChangedEventPayload => ({
        status: 'disconnected',
      }),
    );
  }

  stop(): void {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers.length = 0;
  }

  private forward<E>(eventType: EventName, channel: string, transform: (event: E) => unknown): void {
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
    };
  }
}

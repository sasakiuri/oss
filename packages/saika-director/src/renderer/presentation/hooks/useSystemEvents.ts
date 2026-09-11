import { useCallback, useEffect, useRef } from 'react';
import { useEvent } from './useEvent';
import { mqttService } from '@/renderer/services';
import { useTimerStore } from '@/renderer/presentation/stores/system/timer.store';
import { useConnectionStore } from '@/renderer/presentation/stores/system/connection.store';
import { useDebugStore } from '@/renderer/presentation/stores/system/debug.store';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';
import { formatCompetitionAnnouncementReminder } from '@/renderer/presentation/formatters/competitionAnnouncement';
import { formatFiringWindowViolationReminder } from '@/renderer/presentation/formatters/firingWindowViolation';

/** Updates connection, timer and debug stores and displays system notifications from IPC events. */
export function useSystemEvents(): void {
  const setTimer = useTimerStore((s) => s.setTimer);
  const setExpired = useTimerStore((s) => s.setExpired);
  const addChannel = useConnectionStore((s) => s.addChannel);
  const setConnected = useConnectionStore((s) => s.setConnected);
  const setDisconnected = useConnectionStore((s) => s.setDisconnected);
  const addDebugEntry = useDebugStore((s) => s.addEntry);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const hasReceivedLiveMqttState = useRef(false);

  const applyMqttSnapshot = useCallback(
    (snapshot: MqttControlSnapshotDto) => {
      if (!snapshot.connected) {
        setDisconnected();
        return;
      }

      const connectedChannels = snapshot.lanes.reduce<number[]>((channels, lane) => {
        if (lane.hardware?.connection.status === 'connected' && lane.firingPointNumber !== null) {
          channels.push(lane.firingPointNumber);
        }
        return channels;
      }, []);

      setConnected([...new Set(connectedChannels)].sort((a, b) => a - b));
    },
    [setConnected, setDisconnected],
  );

  useEvent('laneConnected', (data) => {
    hasReceivedLiveMqttState.current = true;
    addChannel(data.channel);
  });

  useEvent('mqttControlStateChanged', (snapshot) => {
    hasReceivedLiveMqttState.current = true;
    applyMqttSnapshot(snapshot);
  });

  useEvent('competitionAnnouncementDue', (announcement) => {
    addNotification('warning', formatCompetitionAnnouncementReminder(announcement));
  });

  useEvent('firingWindowViolationDetected', (violation) => {
    addNotification('warning', formatFiringWindowViolationReminder(violation));
  });

  useEffect(() => {
    let cancelled = false;

    void mqttService.getControlState().then(
      (response) => {
        if (!cancelled && response.success && !hasReceivedLiveMqttState.current) {
          applyMqttSnapshot(response.data);
        }
      },
      () => undefined,
    );

    return () => {
      cancelled = true;
    };
  }, [applyMqttSnapshot]);

  useEvent('timerTick', (data) => {
    setTimer(data.remainingTime, data.phase);
  });

  useEvent('timerExpired', (data) => {
    setExpired(data.phase);
  });

  useEvent('debugLog', (data) => {
    addDebugEntry(data);
  });

  useEvent('mqttConnectionError', (data) => {
    hasReceivedLiveMqttState.current = true;
    addNotification('error', data.message);
    setDisconnected();
  });
}

import { useEvent } from './useEvent';
import { useLiveSnapshot } from './useLiveSnapshot';
import { mqttService } from '@/renderer/services';
import { useConnectionStore } from '@/renderer/presentation/stores/system/connection.store';
import { useDebugStore } from '@/renderer/presentation/stores/system/debug.store';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';
import { formatCompetitionAnnouncementReminder } from '@/renderer/presentation/formatters/competitionAnnouncement';
import { formatFiringWindowViolationReminder } from '@/renderer/presentation/formatters/firingWindowViolation';

/** Updates connection and debug stores and displays system notifications from IPC events. */
export function useSystemEvents(): void {
  const addChannel = useConnectionStore((s) => s.addChannel);
  const setConnected = useConnectionStore((s) => s.setConnected);
  const setDisconnected = useConnectionStore((s) => s.setDisconnected);
  const addDebugEntry = useDebugStore((s) => s.addEntry);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const applyMqttSnapshot = (snapshot: MqttControlSnapshotDto) => {
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
  };

  // A Lane connection or broker error is newer than the initial MQTT state query.
  const { markLive } = useLiveSnapshot('mqttControlStateChanged', () => mqttService.getControlState(), {
    apply: applyMqttSnapshot,
  });

  useEvent('laneConnected', (data) => {
    markLive();
    addChannel(data.channel);
  });

  useEvent('competitionAnnouncementDue', (announcement) => {
    addNotification('warning', formatCompetitionAnnouncementReminder(announcement));
  });

  useEvent('firingWindowViolationDetected', (violation) => {
    addNotification('warning', formatFiringWindowViolationReminder(violation));
  });

  useEvent('debugLog', (data) => {
    addDebugEntry(data);
  });

  useEvent('mqttConnectionError', (data) => {
    markLive();
    addNotification('error', data.message);
    setDisconnected();
  });
}

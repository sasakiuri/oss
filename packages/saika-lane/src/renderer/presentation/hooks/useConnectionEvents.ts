// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useConnectionNotificationStore } from '@/renderer/presentation/stores/connectionNotificationStore';
import { useConnectionStore } from '@/renderer/presentation/stores/connectionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

/**
 * Subscription to connection status change IPC events
 *
 * - connectionStatusChanged: Updates the store on connect/disconnect
 */
export function useConnectionEvents(): void {
  const setConnection = useConnectionStore((s) => s.setConnection);
  const disconnectStore = useConnectionStore((s) => s.disconnect);
  const setDeviceInfo = useSessionStore((s) => s.setDeviceInfo);
  const showUnexpectedDisconnect = useConnectionNotificationStore((s) => s.showUnexpectedDisconnect);
  const dismissUnexpectedDisconnect = useConnectionNotificationStore((s) => s.dismiss);

  useEffect(() => {
    const unsubscribe = window.electronAPI.on.connectionStatusChanged((event) => {
      const selectedDeviceId = useConnectionStore.getState().selectedDeviceId;
      if (event.status === 'connected') {
        if (!event.manufacturer) {
          return;
        }
        dismissUnexpectedDisconnect();
        setConnection(event.connectionId, event.portPath || null, event.manufacturer, selectedDeviceId ?? undefined);
        setDeviceInfo(event.manufacturer, event.deviceId ?? selectedDeviceId ?? null);
      } else {
        disconnectStore();
        setDeviceInfo(null, null);
        if (event.reason !== 'User requested disconnection') {
          showUnexpectedDisconnect(event.reason);
        }
      }
    });
    return () => unsubscribe();
  }, [setConnection, disconnectStore, setDeviceInfo, showUnexpectedDisconnect, dismissUnexpectedDisconnect]);
}

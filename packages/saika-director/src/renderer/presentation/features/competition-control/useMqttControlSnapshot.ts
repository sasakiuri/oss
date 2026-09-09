// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

import { useEvent } from '@/renderer/presentation/hooks/useEvent';
import { mqttService } from '@/renderer/services';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

const EMPTY_SNAPSHOT: MqttControlSnapshotDto = {
  connected: false,
  brokerUrl: null,
  activeCompetitionId: null,
  lanes: [],
  competitions: [],
  lastCommand: null,
};

export function useMqttControlSnapshot() {
  const [snapshot, setSnapshot] = useState<MqttControlSnapshotDto>(EMPTY_SNAPSHOT);
  const activeRef = useRef(false);
  const liveSnapshotVersionRef = useRef(0);
  const refreshRequestIdRef = useRef(0);
  const refresh = useCallback(async () => {
    if (!activeRef.current) return;
    const requestId = ++refreshRequestIdRef.current;
    const liveSnapshotVersion = liveSnapshotVersionRef.current;
    const response = await mqttService.getControlState();
    if (
      activeRef.current &&
      response.success &&
      requestId === refreshRequestIdRef.current &&
      liveSnapshotVersion === liveSnapshotVersionRef.current
    ) {
      setSnapshot(response.data);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void refresh();
    return () => {
      activeRef.current = false;
      refreshRequestIdRef.current += 1;
    };
  }, [refresh]);

  useEvent('mqttControlStateChanged', (nextSnapshot) => {
    liveSnapshotVersionRef.current += 1;
    setSnapshot(nextSnapshot);
  });

  return { snapshot, refresh };
}

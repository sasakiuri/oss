// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { useLiveSnapshot } from '@/renderer/presentation/hooks/useLiveSnapshot';
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
  const { refresh } = useLiveSnapshot('mqttControlStateChanged', () => mqttService.getControlState(), {
    apply: setSnapshot,
  });
  return { snapshot, refresh };
}

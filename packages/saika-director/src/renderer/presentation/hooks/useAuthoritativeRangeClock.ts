import { useEffect, useMemo, useState } from 'react';

import { mqttService } from '@/renderer/services';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

import { projectAuthoritativeRangeClock, type RangeClockProjection } from '../features/boards/rangeClock';
import { useLiveSnapshot } from './useLiveSnapshot';

export function useAuthoritativeRangeClock(competitionId?: string): RangeClockProjection {
  const [snapshot, setSnapshot] = useState<MqttControlSnapshotDto | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useLiveSnapshot('mqttControlStateChanged', () => mqttService.getControlState(), {
    apply: (nextSnapshot) => {
      setSnapshot(nextSnapshot);
      setNowMs(Date.now());
    },
  });

  const projection = useMemo(
    () => projectAuthoritativeRangeClock(snapshot, competitionId, nowMs),
    [competitionId, nowMs, snapshot],
  );

  useEffect(() => {
    if (projection.status !== 'RUNNING' && projection.status !== 'SCHEDULED') return undefined;
    const interval = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(interval);
  }, [projection.status]);

  return projection;
}

import { useEffect, useMemo, useRef, useState } from 'react';

import { mqttService } from '@/renderer/services';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

import { projectAuthoritativeRangeClock, type RangeClockProjection } from '../features/boards/rangeClock';
import { useEvent } from './useEvent';

export function useAuthoritativeRangeClock(competitionId?: string): RangeClockProjection {
  const [snapshot, setSnapshot] = useState<MqttControlSnapshotDto | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const liveRevision = useRef(0);

  useEvent('mqttControlStateChanged', (nextSnapshot) => {
    liveRevision.current += 1;
    setSnapshot(nextSnapshot);
    setNowMs(Date.now());
  });

  useEffect(() => {
    let cancelled = false;
    const revision = liveRevision.current;
    void mqttService.getControlState().then(
      (response) => {
        if (!cancelled && response.success && liveRevision.current === revision) {
          setSnapshot(response.data);
          setNowMs(Date.now());
        }
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

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

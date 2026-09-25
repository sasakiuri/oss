'use client';

import { useEffect, useRef } from 'react';

import type { PushSubscriptionData } from '@/lib/schemas/push';

/**
 * Registers again once per visit when this device has a registration, so the server's record and
 * the device's subscription are renewed together and never expire apart.
 */
export function useRenewal(
  subscription: PushSubscriptionData | null,
  registered: boolean,
  renew: (subscription: PushSubscriptionData) => Promise<void>,
) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !subscription || !registered) return;
    done.current = true;
    void renew(subscription).catch(() => undefined);
    // Runs once the subscription and the saved registration are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscription, registered]);
}

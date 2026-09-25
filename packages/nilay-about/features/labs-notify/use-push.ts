'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

import type { PushSubscriptionData } from '@/lib/schemas/push';

import {
  currentSubscription,
  errorKind,
  PushPermissionError,
  pushSupport,
  sendJson,
  subscribePush,
  unsubscribePush,
  type ErrorKind,
  type PushSupport,
} from './client';

export type PushProblem = ErrorKind | 'denied' | 'unsupported' | 'insecure';

/**
 * This browser's notification state. The subscription is read on mount without asking; permission
 * is asked for only from `enable`, which a button calls.
 */
export function usePush() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [subscription, setSubscription] = useState<PushSubscriptionData | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<PushProblem | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const found = pushSupport();
      const existing = found === 'supported' ? await currentSubscription().catch(() => null) : null;
      if (!active) return;
      setSupport(found);
      setSubscription(existing);
    })();
    return () => {
      active = false;
    };
  }, []);

  const run = useCallback(async <T>(work: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setProblem(null);
    try {
      return await work();
    } catch (error) {
      if (error instanceof PushPermissionError) setProblem('denied');
      else setProblem(errorKind(error));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  /** Subscribes if needed and returns the subscription for a registration request. */
  const enable = useCallback(async () => {
    if (support === 'unsupported' || support === 'insecure') {
      setProblem(support);
      return null;
    }
    const result = await run(subscribePush);
    if (result) setSubscription(result);
    return result;
  }, [run, support]);

  const disable = useCallback(async () => {
    if (!subscription) return false;
    const done = await run(async () => {
      await unsubscribePush(subscription);
      return true;
    });
    if (done) setSubscription(null);
    return Boolean(done);
  }, [run, subscription]);

  const test = useCallback(async () => {
    if (!subscription) return false;
    const result = await run(() =>
      sendJson('/api/labs/push/test', 'POST', { subscription }, z.object({ sent: z.number() })),
    );
    return Boolean(result && result.sent > 0);
  }, [run, subscription]);

  return { support, subscription, busy, problem, setProblem, run, enable, disable, test };
}

export type PushState = ReturnType<typeof usePush>;

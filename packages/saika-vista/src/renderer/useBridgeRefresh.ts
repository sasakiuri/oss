// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

/**
 * Loads state through the Vista bridge on mount, on every change notification and at a fixed interval.
 * Only the most recent request delivers its result, and nothing is delivered after unmount. The
 * arguments are read once, when the component mounts.
 */
export function useBridgeRefresh<T>(
  load: () => Promise<T>,
  intervalMs: number,
  onLoad: (value: T) => void,
  /** Receives a failed load; `latest` is false once a newer request has started. */
  onError: (cause: unknown, latest: boolean) => void,
): void {
  useEffect(() => {
    let active = true;
    let serial = 0;
    const refresh = async () => {
      const request = ++serial;
      try {
        const next = await load();
        if (active && request === serial) onLoad(next);
      } catch (cause) {
        if (active) onError(cause, request === serial);
      }
    };
    const off = window.vista.onChange(() => {
      void refresh();
    });
    void refresh();
    const poll = window.setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => {
      active = false;
      off();
      clearInterval(poll);
    };
  }, []);
}

'use client';

import { useEffect } from 'react';

/** The bootstrap also waits for each tool's saved-state readiness before retiring. */
export function LabsStartupReady() {
  useEffect(() => {
    window.dispatchEvent(new Event('nilay-labs-startup-ready'));
  }, []);
  return null;
}

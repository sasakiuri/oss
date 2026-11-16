// SPDX-License-Identifier: MIT
import type { ReactNode } from 'react';

const ALERT_CLASS = 'rounded-lg border border-red-500 bg-red-500/10 p-3 text-sm text-red-400';

/** Red error box announced politely to assistive technology; `inset` adds the dialog body's side margin. */
export function ErrorAlert({ children, inset = false }: { children: ReactNode; inset?: boolean }) {
  return (
    <div className={inset ? `mx-4 ${ALERT_CLASS}` : ALERT_CLASS} role="alert" aria-live="polite" aria-atomic="true">
      {children}
    </div>
  );
}

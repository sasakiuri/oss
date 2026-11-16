import type { ReactNode } from 'react';

import { sanctionLabelClass } from './sanctionFormClasses';

/** A label above its control. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={sanctionLabelClass}>
      {label}
      {children}
    </label>
  );
}

import type { ReactNode } from 'react';

import { stackedLabelClass } from '../shared/common/formClasses';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={stackedLabelClass}>
      {label}
      {children}
    </label>
  );
}

/** Bordered form of the protest lodging and action forms. */
export const protestFormClass = 'space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3';

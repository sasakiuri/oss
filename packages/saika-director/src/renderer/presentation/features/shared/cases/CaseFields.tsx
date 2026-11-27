import type { ReactNode } from 'react';

import { stackedMediumLabelClass } from '../common/formClasses';

/** Labelled control of a case form. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={stackedMediumLabelClass}>
      {label}
      {children}
    </label>
  );
}

/** One term of a case record's description list. */
export function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-vscode-dimmed">{label}</dt>
      <dd className="mt-0.5 text-vscode-text">{value}</dd>
    </div>
  );
}

/** Full-width input of a case form. */
export const inputClass =
  'min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';

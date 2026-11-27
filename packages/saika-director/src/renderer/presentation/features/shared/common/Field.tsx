import type { ReactNode } from 'react';

import { stackedLabelClass } from './formClasses';

/** A label stacked above its control; `className` adds layout classes such as a grid span. */
export function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={className ? `${stackedLabelClass} ${className}` : stackedLabelClass}>
      {label}
      {children}
    </label>
  );
}

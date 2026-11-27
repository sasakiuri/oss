// SPDX-License-Identifier: MIT
import type { ReactNode } from 'react';

/** Red error text announced as an alert, for a failure inside a settings panel or form. */
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-red-400">
      {children}
    </p>
  );
}

// SPDX-License-Identifier: MIT
export function StatusPill({ good, children }: { good?: boolean; children: React.ReactNode }) {
  return (
    <span className={`status-pill ${good ? 'good' : 'neutral'}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}

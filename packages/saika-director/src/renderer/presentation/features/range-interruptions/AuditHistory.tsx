// SPDX-License-Identifier: MIT
import type { RangeInterruptionCaseDto } from '@/shared/ipc/contracts';

import { formatEnum, formatDuration } from './interruptionFormatting';

export function AuditHistory({ entries }: { entries: RangeInterruptionCaseDto['entries'] }) {
  return (
    <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
      <h4 className="text-xs font-semibold text-vscode-text">Append-only audit history ({entries.length})</h4>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-vscode-text-muted">No operational action has been recorded yet.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="border-t border-vscode-border pt-2 text-xs leading-5 first:border-t-0 first:pt-0"
            >
              <p className="font-semibold text-vscode-text">
                {formatEnum(entry.type)} · {entry.officialName}
              </p>
              <p className="text-vscode-text-muted">{entry.statement}</p>
              <p className="text-vscode-dimmed">
                {new Date(entry.occurredAt).toLocaleString()}
                {entry.lostTimeSeconds !== null ? ` · lost ${formatDuration(entry.lostTimeSeconds)}` : ''}
                {entry.authorizedRemainingSeconds !== null
                  ? ` · authorized ${formatDuration(entry.authorizedRemainingSeconds)}`
                  : ''}
                {entry.incidentReportReference ? ` · RIR ${entry.incidentReportReference}` : ''}
                {entry.ruleReference ? ` · ${entry.ruleReference}` : ''}
                {entry.commandId ? ` · command ${entry.commandId.slice(0, 8)}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

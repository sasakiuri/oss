import { Clipboard, TriangleAlert } from 'lucide-react';

import type { PostCompetitionEquipmentCheckDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { sectionClass } from '../shared/common/formClasses';

import { ConfirmationForm, NoticeForm, TestForm, VoidForm } from './EquipmentControlForms';
import { canRecordTest, canVoid, confirmationPending, entryLabel, selectionLabel } from './equipmentControlRules';
import type { EquipmentControlCommands } from './usePostCompetitionEquipmentChecks';

/** One selected athlete's check with its next action forms and audit history. */
export function EquipmentCheckCard({
  check,
  disabled,
  commands,
}: {
  check: PostCompetitionEquipmentCheckDto;
  disabled: boolean;
  commands: EquipmentControlCommands;
}) {
  return (
    <article className={sectionClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-vscode-text">
            {check.athleteName}
            {check.startNumber ? ` · Start ${check.startNumber}` : ''}
          </h3>
          <p className="mt-0.5 text-xs text-vscode-text-muted">
            {selectionLabel(check.selectionBasis)} · {check.ruleReferences.join(', ')} · selected by {check.selectedBy}
          </p>
        </div>
        <StatusBadge status={check.status} />
      </div>

      {check.separateDisqualificationActionRequired && (
        <div className="mt-3 border-l-2 border-vscode-warning bg-vscode-warning/5 px-3 py-2 text-xs text-vscode-text">
          <p className="flex items-center gap-1.5 font-semibold">
            <TriangleAlert size={14} aria-hidden="true" /> Separate disqualification action required
          </p>
          <p className="mt-1 text-vscode-text-muted">
            Confirming this equipment check does not change the athlete's result. Record the disqualification in
            Sanctions using the authority reference below.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="select-all rounded-sm bg-vscode-input px-2 py-1">{check.sanctionAuthorityReference}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(check.sanctionAuthorityReference)}
            >
              <Clipboard size={13} aria-hidden="true" /> Copy reference
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        {check.status === 'SELECTED' && (
          <NoticeForm check={check} disabled={disabled} onSubmit={commands.issueNotice} />
        )}
        {canRecordTest(check) && <TestForm check={check} disabled={disabled} onSubmit={commands.recordTest} />}
        {confirmationPending(check) && (
          <ConfirmationForm check={check} disabled={disabled} onSubmit={commands.confirmFailure} />
        )}
      </div>

      <details className="mt-3 border-t border-vscode-border pt-2">
        <summary className="cursor-pointer text-xs text-vscode-text-muted">
          Audit history ({check.entries.length}) and selection statement
        </summary>
        <p className="mt-2 text-xs text-vscode-text">{check.selectionStatement}</p>
        {check.entries.length > 0 && (
          <ol className="mt-2 space-y-1 text-xs text-vscode-text-muted">
            {check.entries.map((entry) => (
              <li key={entry.id}>
                {new Date(entry.occurredAt).toLocaleString()} · {entryLabel(entry)} · {entry.statement}
              </li>
            ))}
          </ol>
        )}
        {canVoid(check) && <VoidForm check={check} disabled={disabled} onSubmit={commands.voidCheck} />}
      </details>
    </article>
  );
}

function StatusBadge({ status }: { status: PostCompetitionEquipmentCheckDto['status'] }) {
  const attention = status.includes('FAILED') || status.includes('DID_NOT_REPORT');
  return (
    <span
      className={`rounded-full border px-2 py-1 text-[11px] font-medium ${
        attention
          ? 'border-vscode-warning text-vscode-warning'
          : status === 'PASSED'
            ? 'border-vscode-success text-vscode-success'
            : 'border-vscode-border text-vscode-text-muted'
      }`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

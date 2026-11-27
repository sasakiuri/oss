import { Link } from 'lucide-react';
import { useState } from 'react';

import type { CaseScopePayload, LinkCaseScopePayload } from '@/shared/ipc/contracts';

import { Button } from '../common/Button';

import { inputClass } from './CaseFields';

/** Links a case to the competition or event of the current workspace. */
export function LinkCaseScopeForm({
  caseId,
  scope,
  saving,
  onLink,
}: {
  caseId: string;
  scope: CaseScopePayload;
  saving: boolean;
  onLink: (input: LinkCaseScopePayload) => Promise<boolean>;
}) {
  const [linkedBy, setLinkedBy] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-[3px] border border-vscode-border bg-vscode-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onLink({
          caseId,
          scope,
          linkedBy,
          note: `Linked from the current ${scope.scopeType.toLowerCase()} workspace`,
        });
      }}
    >
      <div className="min-w-52 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-vscode-text">
          <Link size={13} aria-hidden="true" /> Link current {scope.scopeType.toLowerCase()}
        </p>
        <input
          required
          aria-label="Linked by"
          placeholder="Official name"
          value={linkedBy}
          onChange={(event) => setLinkedBy(event.target.value)}
          className={`${inputClass} mt-2`}
        />
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={saving}>
        Link scope
      </Button>
    </form>
  );
}

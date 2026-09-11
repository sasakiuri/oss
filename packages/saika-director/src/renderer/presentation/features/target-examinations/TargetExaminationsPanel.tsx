import { FileSearch, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { TargetExaminationScopePayload } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { CaseDetail } from './CaseDetail';
import { CreateCaseForm } from './CreateCaseForm';
import { formatEnum, statusClass, statusLabel, uniqueScopes } from './examinationPresentation';
import type { TargetExaminationLaneOption } from './examinationTypes';
import { useTargetExaminationCases } from './useTargetExaminationCases';

interface TargetExaminationsPanelProps {
  primaryScope?: TargetExaminationScopePayload;
  additionalScopes?: readonly TargetExaminationScopePayload[];
  lanes?: readonly TargetExaminationLaneOption[];
  defaultLaneId?: string;
}

/** Each workspace visit owns its forms and pending commands. */
export function TargetExaminationsPanel(props: TargetExaminationsPanelProps) {
  const scopeKey = props.primaryScope ? `${props.primaryScope.scopeType}:${props.primaryScope.scopeId}` : 'ALL';
  return <TargetExaminationWorkspace key={scopeKey} {...props} />;
}

function TargetExaminationWorkspace({
  primaryScope,
  additionalScopes = [],
  lanes = [],
  defaultLaneId,
}: TargetExaminationsPanelProps) {
  const { cases, selectedCaseId, selectCase, selectedCase, activeHolds, loading, saving, error, loadCases, commands } =
    useTargetExaminationCases(primaryScope);
  const [showCreate, setShowCreate] = useState(false);

  const currentScopes = useMemo(
    () => uniqueScopes([...(primaryScope ? [primaryScope] : []), ...additionalScopes]),
    [additionalScopes, primaryScope],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileSearch size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Target Examination</h2>
            {activeHolds > 0 && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-vscode-warning/60 px-1.5 py-0.5 text-[11px] font-semibold text-vscode-warning">
                <ShieldAlert size={12} aria-hidden="true" /> {activeHolds} hold{activeHolds === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Record target examinations under ISSF 6.10.5–6.10.9. Opening a case protects its data from reset or
            deletion; recording a decision does not change scores.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void loadCases()}>
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </Button>
          {primaryScope && (
            <Button size="sm" disabled={saving} onClick={() => setShowCreate(true)}>
              <Plus size={14} aria-hidden="true" /> Open case
            </Button>
          )}
        </div>
      </header>

      {error && <div className="border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error">{error}</div>}
      {loading && <p className="text-[13px] text-vscode-text-muted">Loading target examinations…</p>}

      {showCreate && primaryScope && (
        <CreateCaseForm
          scopes={currentScopes}
          lanes={lanes}
          defaultLaneId={defaultLaneId}
          saving={saving}
          onCancel={() => setShowCreate(false)}
          onCreate={commands.create}
        />
      )}

      {!loading && cases.length === 0 && !showCreate && (
        <div className="border-y border-vscode-border py-5">
          <p className="text-[13px] font-medium text-vscode-text">No target-examination cases</p>
          <p className="mt-1 text-xs text-vscode-text-muted">
            {primaryScope
              ? 'Open a case before examining EST records or collecting the items listed by ISSF 6.10.8.'
              : 'No target-examination cases have been recorded in a competition or event workspace.'}
          </p>
        </div>
      )}

      {cases.length > 0 && (
        <div className="grid min-h-80 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-[3px] border border-vscode-border bg-vscode-bg">
            <div className="border-b border-vscode-border px-3 py-2 text-xs font-semibold text-vscode-text">
              Cases ({cases.length})
            </div>
            <div className="max-h-[42rem] overflow-auto">
              {[...cases].reverse().map((examination) => (
                <button
                  key={examination.id}
                  type="button"
                  className={`block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 ${
                    examination.id === selectedCaseId ? 'bg-vscode-highlight' : 'hover:bg-vscode-bg-hover'
                  }`}
                  onClick={() => selectCase(examination.id)}
                >
                  <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-vscode-text">
                    {examination.summary}
                    <span className={statusClass(examination)}>{statusLabel(examination)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-vscode-text-muted">
                    {examination.firingPointNumber ? `Firing point ${examination.firingPointNumber}` : 'Range-wide'} ·{' '}
                    {formatEnum(examination.issueKind)}
                  </span>
                  <span className="block text-xs text-vscode-dimmed">
                    {new Date(examination.occurredAt).toLocaleString()} · {examination.id.slice(0, 8)}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0">
            {selectedCase ? (
              <CaseDetail
                key={selectedCase.id}
                examination={selectedCase}
                additionalScopes={additionalScopes}
                saving={saving}
                commands={commands}
              />
            ) : (
              <p className="text-xs text-vscode-text-muted">Select a target-examination case.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// SPDX-License-Identifier: MIT
import { ClockAlert, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { rangeInterruptionsService } from '@/renderer/services';
import type { RangeInterruptionPhaseDto, RangeInterruptionScopePayload } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { CreateInterruptionForm } from './CreateInterruptionForm';
import { InterruptionDetail } from './InterruptionDetail';
import { statusClass, formatEnum } from './interruptionFormatting';
import { type RangeInterruptionLaneOption, type DetailAction } from './interruptionPresentationTypes';
import { useRangeInterruptionCases } from './useRangeInterruptionCases';

export function RangeInterruptionsPanel({
  primaryScope,
  additionalScopes = [],
  lanes = [],
  competitionId,
  defaultLaneId,
  defaultPhase = 'MATCH',
  defaultRemainingSeconds = 0,
  qualificationTimedTargetCompetitionTypeId,
}: RangeInterruptionsPanelProps) {
  const {
    cases,
    selectedCaseId,
    setSelectedCaseId,
    selectedCase,
    activeHolds,
    loading,
    saving,
    error,
    loadCases,
    runMutation,
  } = useRangeInterruptionCases(primaryScope);
  const [showCreate, setShowCreate] = useState(false);
  const [detailAction, setDetailAction] = useState<DetailAction>(null);

  useEffect(() => {
    setShowCreate(false);
    setDetailAction(null);
  }, [primaryScope?.scopeType, primaryScope?.scopeId]);

  const scopes = useMemo(
    () => uniqueScopes([...(primaryScope ? [primaryScope] : []), ...additionalScopes]),
    [additionalScopes, primaryScope],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClockAlert size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Range Interruptions</h2>
            {activeHolds > 0 && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-vscode-warning/60 px-1.5 py-0.5 text-[11px] font-semibold text-vscode-warning">
                <ShieldAlert size={12} aria-hidden="true" /> {activeHolds} active
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            ISSF 6.10.9 / 6.11.3 audit ledger. Recommendations are advisory; an official must record every grant.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void loadCases()}>
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </Button>
          {primaryScope && (
            <Button size="sm" disabled={saving} onClick={() => setShowCreate(true)}>
              <Plus size={14} aria-hidden="true" /> Open record
            </Button>
          )}
        </div>
      </header>

      {error && <div className="border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error">{error}</div>}
      {loading && <p className="text-[13px] text-vscode-text-muted">Loading interruption records…</p>}

      {showCreate && primaryScope && (
        <CreateInterruptionForm
          scopes={scopes}
          lanes={lanes}
          defaultLaneId={defaultLaneId}
          defaultPhase={defaultPhase}
          defaultRemainingSeconds={defaultRemainingSeconds}
          qualificationTimedTargetCompetitionTypeId={qualificationTimedTargetCompetitionTypeId}
          saving={saving}
          onCancel={() => setShowCreate(false)}
          onCreate={async (input) => {
            const succeeded = await runMutation(async () => {
              const response = await rangeInterruptionsService.create(input);
              if (!response.success) throw new Error(response.error.message);
              return response.data;
            });
            if (succeeded) setShowCreate(false);
          }}
        />
      )}

      {!loading && cases.length === 0 && !showCreate && (
        <div className="border-y border-vscode-border py-5">
          <p className="text-[13px] font-medium text-vscode-text">No interruption records</p>
          <p className="mt-1 text-xs text-vscode-text-muted">
            {primaryScope
              ? 'Open a record when firing is interrupted. Creating the record alone does not send a Lane command.'
              : 'No interruption records have been retained in a competition or event workspace.'}
          </p>
        </div>
      )}

      {cases.length > 0 && (
        <div className="grid min-h-80 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-[3px] border border-vscode-border bg-vscode-bg">
            <div className="border-b border-vscode-border px-3 py-2 text-xs font-semibold text-vscode-text">
              Records ({cases.length})
            </div>
            <div className="max-h-[48rem] overflow-auto">
              {[...cases].reverse().map((interruption) => (
                <button
                  key={interruption.id}
                  type="button"
                  className={`block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 ${
                    interruption.id === selectedCaseId ? 'bg-vscode-highlight' : 'hover:bg-vscode-bg-hover'
                  }`}
                  onClick={() => {
                    setSelectedCaseId(interruption.id);
                    setDetailAction(null);
                  }}
                >
                  <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-vscode-text">
                    <span className="truncate">{interruption.summary}</span>
                    <span className={statusClass(interruption.status)}>{formatEnum(interruption.status)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-vscode-text-muted">
                    {interruption.firingPointNumber ? `Firing point ${interruption.firingPointNumber}` : 'Range-wide'} ·{' '}
                    {formatEnum(interruption.cause)}
                  </span>
                  <span className="block text-xs text-vscode-dimmed">
                    {new Date(interruption.startedAt).toLocaleString()} · {interruption.id.slice(0, 8)}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0">
            {selectedCase ? (
              <InterruptionDetail
                interruption={selectedCase}
                additionalScopes={additionalScopes}
                lanes={lanes}
                competitionId={competitionId}
                saving={saving}
                action={detailAction}
                onAction={setDetailAction}
                onMutate={runMutation}
              />
            ) : (
              <p className="text-xs text-vscode-text-muted">Select an interruption record.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

interface RangeInterruptionsPanelProps {
  primaryScope?: RangeInterruptionScopePayload;
  additionalScopes?: readonly RangeInterruptionScopePayload[];
  lanes?: readonly RangeInterruptionLaneOption[];
  competitionId?: string;
  defaultLaneId?: string;
  defaultPhase?: RangeInterruptionPhaseDto;
  defaultRemainingSeconds?: number;
  qualificationTimedTargetCompetitionTypeId?: string;
}

function uniqueScopes(scopes: readonly RangeInterruptionScopePayload[]): RangeInterruptionScopePayload[] {
  const seen = new Set<string>();
  return scopes.filter((scope) => {
    const key = `${scope.scopeType}:${scope.scopeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type { RangeInterruptionLaneOption } from './interruptionPresentationTypes';

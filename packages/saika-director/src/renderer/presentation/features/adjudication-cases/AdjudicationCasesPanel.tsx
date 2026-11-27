import { CaseListItem } from '../shared/cases/CaseListItem';
import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';

import { AdjudicationCaseDetail } from './AdjudicationCaseDetail';
import { CreateAdjudicationCaseForm } from './CreateAdjudicationCaseForm';
import { useAdjudicationCases } from './useAdjudicationCases';

export function AdjudicationCasesPanel({ eventId }: { eventId: string }) {
  const { cases, selectedId, setSelectedId, selected, candidates, loading, saving, error, load, commands } =
    useAdjudicationCases(eventId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-vscode-text">Adjudication cases</h2>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Optional case files link independent decisions, reports, and protests without changing their own ledgers.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error && <InlineError>{error}</InlineError>}

      <CreateAdjudicationCaseForm eventId={eventId} disabled={saving} onCreate={commands.create} />

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[3px] border border-vscode-border">
          {cases.length === 0 && !loading && <p className="p-3 text-xs text-vscode-text-muted">No case files.</p>}
          {cases.map((value) => (
            <CaseListItem key={value.id} selected={value.id === selectedId} onSelect={() => setSelectedId(value.id)}>
              <span className="block text-[13px] font-medium text-vscode-text">{value.subject}</span>
              <span className="mt-0.5 block text-xs text-vscode-text-muted">
                {value.category} · {value.status} · {value.links.length} links
              </span>
            </CaseListItem>
          ))}
        </div>

        {selected && (
          <AdjudicationCaseDetail value={selected} candidates={candidates} saving={saving} commands={commands} />
        )}
      </div>
    </div>
  );
}

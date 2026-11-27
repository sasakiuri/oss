import { Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { boardService, protestsService } from '@/renderer/services';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import type { ProtestCaseDto } from '@/shared/ipc/contracts';

import { useCaseWorkspace, type CaseWorkspaceOptions } from '../shared/cases/useCaseWorkspace';
import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';

import { CreateProtestForm } from './CreateProtestForm';
import { ProtestDetail } from './ProtestDetail';

const workspaceOptions: CaseWorkspaceOptions<'EVENT', ProtestCaseDto> = {
  list: async (scope) => (scope ? unwrap(await protestsService.list(scope)) : []),
  isDefaultCandidate: () => true,
  loadFailure: 'Failed to load protest records',
  mutationFailure: 'Failed to update the protest record',
};

export function ProtestsPanel({ scopeId }: { scopeId: string }) {
  const {
    cases,
    selectedCaseId,
    selectCase,
    selectedCase: selected,
    error: loadError,
    loadCases,
  } = useCaseWorkspace({ scopeType: 'EVENT', scopeId }, workspaceOptions);
  const [creating, setCreating] = useState(false);
  // The panel has one alert: a print request replaces the list error until the next reload. `undefined` means no
  // print request since the last reload.
  const [printError, setPrintError] = useState<string | null>();
  const error = printError === undefined ? loadError : printError;
  useEffect(() => {
    setCreating(false);
    setPrintError(undefined);
  }, [scopeId]);
  const load = useCallback(async () => {
    setPrintError(undefined);
    await loadCases();
  }, [loadCases]);
  const print = async (protestId: string) => {
    setPrintError(null);
    try {
      unwrap(await boardService.openProtestPrint({ protestId }));
    } catch (caught) {
      setPrintError(errorMessage(caught, 'Failed to open the protest print preview'));
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-vscode-text">Protests and Appeals</h2>
          <p className="mt-1 text-xs text-vscode-text-muted">
            Form P / Form AP references, fees, deadlines and Jury decisions (ISSF 6.16 / 6.17.1.13).
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <RefreshCw size={13} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={13} /> Lodge
          </Button>
        </div>
      </header>
      {error && <InlineError role="alert">{error}</InlineError>}
      {creating && (
        <CreateProtestForm
          key={scopeId}
          scopeId={scopeId}
          cases={cases}
          onCancel={() => setCreating(false)}
          onSaved={async (item) => {
            setCreating(false);
            selectCase(item.id);
            await load();
          }}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="border border-vscode-border">
          {cases.length === 0 && <p className="p-3 text-xs text-vscode-text-muted">No protest records.</p>}
          {[...cases].reverse().map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectCase(item.id)}
              className={`block w-full border-b border-vscode-border p-3 text-left text-xs ${item.id === selectedCaseId ? 'bg-vscode-highlight' : ''}`}
            >
              <span className="block font-semibold text-vscode-text">{item.subject}</span>
              <span className="text-vscode-text-muted">
                {item.kind} · {item.status}
              </span>
            </button>
          ))}
        </aside>
        {selected && <ProtestDetail key={selected.id} protest={selected} onChanged={load} onPrint={print} />}
      </div>
    </div>
  );
}

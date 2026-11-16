import { Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { boardService, protestsService } from '@/renderer/services';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import type { ProtestCaseDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';

import { CreateProtestForm } from './CreateProtestForm';
import { ProtestDetail } from './ProtestDetail';

export function ProtestsPanel({ scopeId }: { scopeId: string }) {
  const [cases, setCases] = useState<ProtestCaseDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadId = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++loadId.current;
    setError(null);
    try {
      const response = await protestsService.list({ scopeType: 'EVENT', scopeId });
      if (requestId !== loadId.current) return;
      const listed = unwrap(response);
      setCases(listed);
      setSelectedId((current) =>
        current && listed.some((item) => item.id === current) ? current : (listed.at(-1)?.id ?? null),
      );
    } catch (caught) {
      if (requestId === loadId.current) setError(errorMessage(caught, 'Failed to load protest records'));
    }
  }, [scopeId]);
  useEffect(() => {
    setCases([]);
    setSelectedId(null);
    setCreating(false);
    void load();
    return () => {
      loadId.current++;
    };
  }, [load]);
  const selected = cases.find((item) => item.id === selectedId) ?? null;
  const print = async (protestId: string) => {
    setError(null);
    try {
      unwrap(await boardService.openProtestPrint({ protestId }));
    } catch (caught) {
      setError(errorMessage(caught, 'Failed to open the protest print preview'));
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
            setSelectedId(item.id);
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
              onClick={() => setSelectedId(item.id)}
              className={`block w-full border-b border-vscode-border p-3 text-left text-xs ${item.id === selectedId ? 'bg-vscode-highlight' : ''}`}
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

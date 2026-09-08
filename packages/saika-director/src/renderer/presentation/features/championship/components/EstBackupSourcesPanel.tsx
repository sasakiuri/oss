import { useEffect, useRef, useState } from 'react';

import { boardService, estBackupVerificationService } from '@/renderer/services';
import type {
  EstBackupSourceDto,
  EstBackupSourceSummaryDto,
} from '@/shared/ipc/contracts/estBackupVerification.contract';

import { Button } from '../../shared/common/Button';

export function EstBackupSourcesPanel({
  eventId,
  generation,
  onSelected,
}: {
  eventId: string;
  generation: number;
  onSelected: (source: EstBackupSourceDto) => void;
}) {
  const [sources, setSources] = useState<EstBackupSourceSummaryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void estBackupVerificationService
      .listSources({ eventId })
      .then((result) => {
        if (cancelled) return;
        if (!result.success) throw new Error(result.error.message);
        setSources(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, generation, refresh]);
  return (
    <section aria-label="Retained backup sources" className="space-y-2 border-t border-vscode-border pt-3 text-xs">
      <div className="flex items-center justify-between">
        <h4>Retained source files</h4>
        <Button size="sm" variant="secondary" onClick={() => setRefresh((value) => value + 1)}>
          Refresh sources
        </Button>
      </div>
      <p className="text-vscode-text-muted">
        Sources can be printed before results are available. Reusing a source preserves its original records and file
        identity.
      </p>
      {error && (
        <p role="alert" className="text-vscode-error">
          {error}
        </p>
      )}
      {sources.map((source) => (
        <div key={source.id} className="space-y-1 border-l border-vscode-border pl-2">
          <p>
            {source.fileName} · {source.recordCount} records · {new Date(source.importedAt).toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  try {
                    const result = await estBackupVerificationService.getSource({ sourceId: source.id });
                    if (!result.success) throw new Error(result.error.message);
                    if (result.data.eventId !== eventId || result.data.id !== source.id)
                      throw new Error('The source belongs to another event');
                    if (mounted.current) {
                      onSelected(result.data);
                      setError(null);
                    }
                  } catch (caught) {
                    if (mounted.current) setError(String(caught));
                  } finally {
                    if (mounted.current) setBusy(false);
                  }
                })()
              }
            >
              Use source records
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void boardService
                  .openEstBackupSourcePrint({ sourceId: source.id })
                  .then((result) => {
                    if (!result.success) setError(result.error.message);
                  })
                  .catch((caught: unknown) => setError(String(caught)))
              }
            >
              Print source
            </Button>
          </div>
        </div>
      ))}
      {!sources.length && <p>No retained sources for this event.</p>}
    </section>
  );
}

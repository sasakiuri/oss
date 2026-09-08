import { useEffect, useState } from 'react';

import { protestsService } from '@/renderer/services';
import type { ProtestCaseDto } from '@/shared/ipc/contracts';
import type { BoardWindowConfig } from '@/shared/types/BoardWindowConfig';

import { ProtestSheet } from './components/ProtestSheet';

interface PrintSnapshot {
  caseId: string;
  protest: ProtestCaseDto;
  parent: ProtestCaseDto | null;
  loadedAt: string;
}

export function ProtestPrintScreen({ config }: { config: BoardWindowConfig }) {
  const [snapshot, setSnapshot] = useState<PrintSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    const load = async () => {
      if (!config.protestId) throw new Error('No protest or appeal was specified');
      const response = await protestsService.getById({ caseId: config.protestId });
      if (!response.success) throw new Error(response.error.message);
      const protest = response.data;
      let parent: ProtestCaseDto | null = null;
      if (protest.kind === 'APPEAL') {
        if (!protest.parentProtestId) throw new Error('The original protest reference is missing');
        const original = await protestsService.getById({ caseId: protest.parentProtestId });
        if (!original.success) throw new Error(`Cannot load the original protest: ${original.error.message}`);
        parent = original.data;
      }
      if (!cancelled) {
        setSnapshot({ caseId: config.protestId, protest, parent, loadedAt: new Date().toISOString() });
      }
    };
    void load().catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : 'Failed to load the protest record');
    });
    return () => {
      cancelled = true;
    };
  }, [config.protestId, revision]);

  const current = snapshot?.caseId === config.protestId ? snapshot : null;
  return (
    <div className="print-container">
      <div className="print-preview-controls no-print">
        <button className={buttonClass} disabled={!current} onClick={() => window.print()}>
          Print
        </button>
        <button
          className={buttonClass}
          onClick={() => {
            setSnapshot(null);
            setRevision((value) => value + 1);
          }}
        >
          Refresh
        </button>
        <button className={buttonClass} onClick={() => window.close()}>
          Close
        </button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : current ? (
        <>
          <ProtestSheet protest={current.protest} loadedAt={current.loadedAt} />
          {current.parent && (
            <div className="page-break">
              <ProtestSheet protest={current.parent} loadedAt={current.loadedAt} originalFor={current.protest.id} />
            </div>
          )}
        </>
      ) : (
        <p role="status">Loading protest record…</p>
      )}
    </div>
  );
}

const buttonClass = 'rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50';

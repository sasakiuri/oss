import { useEffect, useState } from 'react';

import { estBackupVerificationService } from '@/renderer/services';
import type { EstBackupSourceDto } from '@/shared/ipc/contracts/estBackupVerification.contract';
import type { BoardWindowConfig } from '@/shared/types/BoardWindowConfig';

export function EstBackupSourcePrintScreen({ config }: { config: BoardWindowConfig }) {
  const [source, setSource] = useState<EstBackupSourceDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeOriginal, setIncludeOriginal] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSource(null);
    setError(null);
    const load = async () => {
      if (!config.sourceId) throw new Error('No retained backup source was selected');
      const result = await estBackupVerificationService.getSource({ sourceId: config.sourceId });
      if (!result.success) throw new Error(result.error.message);
      if (result.data.id !== config.sourceId) throw new Error('The returned backup source does not match');
      if (!cancelled) setSource(result.data);
    };
    void load().catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
    });
    return () => {
      cancelled = true;
    };
  }, [config.sourceId]);
  const current = source?.id === config.sourceId ? source : null;
  return (
    <div className="print-container">
      <div className="print-preview-controls no-print">
        <button className={button} disabled={!current} onClick={() => window.print()}>
          Print
        </button>
        <label>
          <input
            type="checkbox"
            checked={includeOriginal}
            onChange={(event) => setIncludeOriginal(event.target.checked)}
          />{' '}
          Include original source text
        </label>
        <button className={button} onClick={() => window.close()}>
          Close
        </button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : current ? (
        <article className="mx-auto max-w-[190mm] bg-white p-6 text-[11px] text-black [overflow-wrap:anywhere]">
          <h1 className="text-xl font-bold">Retained EST backup source</h1>
          <p>
            {current.fileName} · Imported {current.importedAt} (UTC)
          </p>
          <p>
            Source ID: {current.id} · Event: {current.eventId}
          </p>
          <p>
            Format: {current.format} · {current.recordCount} records · {current.sizeBytes} bytes
          </p>
          <p className="break-all">Original SHA-256: {current.sha256}</p>
          <p className="break-all">{current.sourceReference}</p>
          <p className="my-3">
            Imported source values. The source device or media must be verified separately as independent of the main
            EST computer. Result comparison and official approval are separate operations.
          </p>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th className={cell}>Source key</th>
                <th className={cell}>Source rank</th>
                <th className={cell}>Source total</th>
              </tr>
            </thead>
            <tbody>
              {current.records.map((record) => (
                <tr key={record.key} className="break-inside-avoid">
                  <td className={cell}>{record.key}</td>
                  <td className={cell}>{record.rank ?? 'Not supplied'}</td>
                  <td className={cell}>{record.totalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {current.records
            .filter((record) => record.shotScores || record.seriesScores)
            .map((record) => (
              <section key={record.key} className="my-4">
                <h2 className="text-sm font-bold">Source detail: {record.key}</h2>
                {(
                  [
                    ['Series', record.seriesScores],
                    ['Shot', record.shotScores],
                  ] as const
                ).map(
                  ([label, scores]) =>
                    scores && (
                      <div key={label} className="my-2">
                        <h3 className="font-semibold">{label} scores (position: value)</h3>
                        {scores.length ? (
                          <div className="grid grid-cols-5 gap-1">
                            {scores.map((score, index) => (
                              <span key={index}>
                                {index + 1}: {score}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p>No detail supplied</p>
                        )}
                      </div>
                    ),
                )}
              </section>
            ))}
          {includeOriginal && (
            <section className="page-break">
              <h2 className="text-lg font-bold">Original source text</h2>
              <pre className="whitespace-pre-wrap break-all text-[9px]">{current.content}</pre>
            </section>
          )}
        </article>
      ) : (
        <p role="status">Loading retained backup source…</p>
      )}
    </div>
  );
}
const button = 'rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50';
const cell = 'border-b border-gray-300 p-2';

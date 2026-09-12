import { useEffect, useState } from 'react';

import { resultPublicationService } from '@/renderer/services';
import type { ResultBoardSnapshotDto } from '@/shared/ipc/contracts/resultPublication.contract';
import { classificationSuppressesScore } from '@/shared/utils/resultClassification';

const labels: Record<ResultBoardSnapshotDto['state'], string> = {
  DRAFT: 'Draft',
  PRELIMINARY: 'Preliminary',
  PROTEST_PENDING: 'Protest pending',
  PROTEST_CLOSED: 'Protest period closed · Official publication pending',
  OFFICIAL: 'Official',
  FINAL: 'RESULTS ARE FINAL',
  REVIEW_REQUIRED: 'Results or approval changed · Publication review required',
};

export function PublishedResultsSummary({
  eventId,
  resultScope,
}: {
  eventId: string;
  resultScope: ResultBoardSnapshotDto['resultScope'];
}) {
  const [snapshot, setSnapshot] = useState<ResultBoardSnapshotDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout>;
    let timeout: ReturnType<typeof setTimeout>;
    setSnapshot(null);
    setError(null);
    const refresh = async () => {
      try {
        const response = await Promise.race([
          resultPublicationService.getBoardSnapshot({ eventId, resultScope }),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('The results update timed out')), 10_000);
          }),
        ]);
        if (cancelled) return;
        if (!response.success) throw new Error(response.error.message);
        if (response.data.eventId !== eventId || response.data.resultScope !== resultScope) {
          throw new Error('The results update belongs to another event');
        }
        setSnapshot(response.data);
        setError(null);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        clearTimeout(timeout);
        if (!cancelled) refreshTimer = setTimeout(() => void refresh(), 2000);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
      clearTimeout(timeout);
    };
  }, [eventId, resultScope]);

  const current = snapshot?.eventId === eventId && snapshot.resultScope === resultScope ? snapshot : null;
  const rows = [...(current?.results ?? [])].sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity));
  return (
    <section aria-label="Result publication summary" className="space-y-4 text-vscode-text">
      <h2 className="text-lg">
        {resultScope === 'FINAL' ? 'Final · Result summary' : 'Qualification · Individual result summary'}
      </h2>
      {error ? (
        <div role="alert" className="text-vscode-error">
          <p>Updates unavailable · Publication status unconfirmed</p>
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <p role="status" className="text-2xl font-semibold">
          {current ? labels[current.state] : 'Loading results…'}
        </p>
      )}
      {current && (
        <>
          <p className="text-sm text-vscode-dimmed">
            {error ? 'Last successful update' : 'Updated'}: {new Date(current.checkedAt).toLocaleString()}
          </p>
          {!error && current.postedAt && (
            <p className="text-sm">
              {resultScope === 'FINAL' ? 'Declared' : 'Posted'}: {new Date(current.postedAt).toLocaleString()}
            </p>
          )}
          {!error && current.protestEndsAt && (
            <p className="text-lg">Protest deadline: {new Date(current.protestEndsAt).toLocaleString()}</p>
          )}
          {rows.length === 0 ? (
            <p>No results available</p>
          ) : (
            <table className="w-full text-lg">
              <thead>
                <tr className="border-b border-vscode-border text-left">
                  <th className="p-2">Rank</th>
                  <th className="p-2">{resultScope === 'FINAL' ? 'Athlete / team' : 'Athlete'}</th>
                  <th className="p-2">Affiliation</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.resultId} className="border-b border-vscode-border">
                    <td className="p-2">
                      {row.classificationCode ??
                        (row.entryStatus && row.entryStatus !== 'COMPETING' ? row.entryStatus : row.rank || '—')}
                    </td>
                    <td className="p-2">{row.playerName}</td>
                    <td className="p-2">{row.affiliation}</td>
                    <td className="p-2 text-right">
                      {classificationSuppressesScore(row.classificationCode ?? row.entryStatus) ? '—' : row.totalScore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

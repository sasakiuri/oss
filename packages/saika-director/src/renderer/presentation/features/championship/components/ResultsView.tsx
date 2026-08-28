import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useResults } from '../../../hooks/useResults';
import { CheckCircle, ClipboardCheck, Printer, Scale } from 'lucide-react';
import { Logger } from '@/shared/utils/Logger';
import type { FinalRankedResultDto } from '@/shared/ipc/contracts/results.contract';
import { resultsService, boardService } from '@/renderer/services';
import { useNotificationStore } from '../../../stores/ui/notifications.store';
import { Button } from '../../shared/common/Button';
import { ScoringDecisionPanel } from './ScoringDecisionPanel';
import type { RankedResultDto } from '@/shared/ipc/contracts/results.contract';
import { ResultVerificationPanel } from './ResultVerificationPanel';
import { FinalPlacementReviewPanel } from './FinalPlacementReviewPanel';

const logger = Logger.create('ResultsView');

interface ResultsViewProps {
  eventId: string;
  eventName?: string;
  round?: string;
  readOnly?: boolean;
}

export function ResultsView({ eventId, eventName, round = 'Qualification', readOnly = false }: ResultsViewProps) {
  const isFinal = round === 'Final';

  const {
    results: qualificationResults,
    loading: qLoading,
    error: qError,
    getEventResults,
    getRelayResults,
    confirmResults,
    clearResults,
  } = useResults();

  const [finalResults, setFinalResults] = useState<FinalRankedResultDto[]>([]);
  const [finalLoading, setFinalLoading] = useState(false);
  const [finalError, setFinalError] = useState<string | null>(null);

  const [relayFilter, setRelayFilter] = useState<{
    eventId: string;
    isFinal: boolean;
    value: number | 'all';
  }>({ eventId, isFinal, value: 'all' });
  const selectedRelay = relayFilter.eventId === eventId && relayFilter.isFinal === isFinal ? relayFilter.value : 'all';
  const [availableRelays, setAvailableRelays] = useState<number[]>([]);
  const [printLoading, setPrintLoading] = useState(false);
  const [decisionResult, setDecisionResult] = useState<RankedResultDto | FinalRankedResultDto | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [placementReviewOpen, setPlacementReviewOpen] = useState(false);
  const finalRequestId = useRef(0);

  const results = isFinal ? [] : qualificationResults;
  const loading = isFinal ? finalLoading : qLoading;
  const error = isFinal ? finalError : qError;

  useEffect(() => {
    if (relayFilter.eventId !== eventId || relayFilter.isFinal !== isFinal) {
      setRelayFilter({ eventId, isFinal, value: 'all' });
      setAvailableRelays([]);
    }
  }, [eventId, isFinal, relayFilter.eventId, relayFilter.isFinal]);

  useEffect(() => {
    clearResults();
    setDecisionResult(null);
    setPlacementReviewOpen(false);
  }, [eventId, isFinal, clearResults]);

  const refreshFinalResults = useCallback(async () => {
    const requestId = ++finalRequestId.current;
    setFinalLoading(true);
    setFinalError(null);
    try {
      const response = await resultsService.getFinalByEvent({ eventId });
      if (requestId !== finalRequestId.current) return;
      if (!response.success) throw new Error(response.error?.message ?? 'Failed to load results');
      setFinalResults(response.data.results);
    } catch (err) {
      if (requestId !== finalRequestId.current) return;
      setFinalError(err instanceof Error ? err.message : 'Failed to load results');
    } finally {
      if (requestId === finalRequestId.current) setFinalLoading(false);
    }
  }, [eventId]);

  const filteredResults = useMemo(() => {
    if (isFinal) return [];
    if (selectedRelay === 'all') {
      return results;
    }
    return results.filter((r) => r.relayNumber === selectedRelay);
  }, [results, selectedRelay, isFinal]);

  const seriesCount = useMemo(() => {
    if (isFinal) return 0;
    return results.reduce((max, r) => Math.max(max, r.seriesScores.length), 0);
  }, [results, isFinal]);

  const publishedResultIds = useMemo(() => {
    if (isFinal) return [];
    return filteredResults.filter((r) => r.status === 'published').map((r) => r.id);
  }, [filteredResults, isFinal]);

  useEffect(() => {
    let cancelled = false;
    if (isFinal) {
      setFinalResults([]);
      void refreshFinalResults();
    } else {
      if (selectedRelay === 'all') {
        void getEventResults(eventId).then((response) => {
          if (cancelled || !response?.success) return;
          const relays = new Set(response.data.results.map((result) => result.relayNumber));
          setAvailableRelays(Array.from(relays).sort((a, b) => a - b));
        });
      } else {
        void getRelayResults(eventId, selectedRelay);
      }
    }
    return () => {
      cancelled = true;
      if (isFinal) finalRequestId.current += 1;
    };
  }, [eventId, selectedRelay, isFinal, getEventResults, getRelayResults, refreshFinalResults]);

  const handleRelayChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setRelayFilter({
        eventId,
        isFinal,
        value: value === 'all' ? 'all' : parseInt(value, 10),
      });
    },
    [eventId, isFinal],
  );

  const handleConfirm = useCallback(async () => {
    if (publishedResultIds.length === 0) {
      return;
    }
    const response = await confirmResults(eventId, publishedResultIds);
    if (response) {
      if (selectedRelay === 'all') {
        getEventResults(eventId);
      } else {
        getRelayResults(eventId, selectedRelay);
      }
    }
  }, [eventId, publishedResultIds, confirmResults, selectedRelay, getEventResults, getRelayResults]);

  const refreshQualificationResults = useCallback(() => {
    if (selectedRelay === 'all') {
      void getEventResults(eventId);
    } else {
      void getRelayResults(eventId, selectedRelay);
    }
  }, [eventId, getEventResults, getRelayResults, selectedRelay]);

  const handlePrint = useCallback(async () => {
    setPrintLoading(true);
    try {
      const response = await boardService.openResultsListPrint({
        eventId,
        eventName,
        relayNumber: selectedRelay === 'all' ? undefined : selectedRelay,
      });
      if (!response.success) throw new Error(response.error.message);
    } catch (err) {
      logger.error('Error opening print window:', err);
      useNotificationStore.getState().addNotification('error', 'Failed to open the print window');
    } finally {
      setPrintLoading(false);
    }
  }, [eventId, eventName, selectedRelay]);

  if (loading) {
    return (
      <div className="border-y border-vscode-border py-4 text-[13px] text-vscode-text-muted">Loading results…</div>
    );
  }

  if (error) {
    return <div className="border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error">{error}</div>;
  }

  if (isFinal) {
    if (finalResults.length === 0) {
      return (
        <div className="border-y border-vscode-border py-4">
          <p className="text-[13px] font-medium text-vscode-text">No final results</p>
          <p className="mt-1 text-xs text-vscode-text-muted">Results appear when the final ends.</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-end gap-2">
          {!readOnly && (
            <Button size="sm" variant="secondary" onClick={() => setPlacementReviewOpen(true)}>
              <ClipboardCheck size={14} aria-hidden="true" />
              Review placements
            </Button>
          )}
          <Button size="sm" onClick={handlePrint} disabled={finalResults.length === 0 || printLoading}>
            <Printer size={14} aria-hidden="true" />
            {printLoading ? 'Opening…' : 'Print'}
          </Button>
        </div>

        {finalResults.some((result) => result.placementReviewRequired) && (
          <div className="border-l-2 border-vscode-warning pl-3 text-[13px] text-vscode-warning">
            One or more Final placements require jury review. Source elimination ranks are preserved until reviewed.
          </div>
        )}

        <div className="overflow-auto border border-vscode-border rounded">
          <table className="w-full text-vscode-text">
            <thead className="bg-vscode-sidebar text-base text-vscode-text">
              <tr className="border-b border-vscode-border">
                <th className="px-2 py-1.5 text-center w-12">Rank</th>
                <th className="px-2 py-1.5 text-left">Athlete</th>
                <th className="px-2 py-1.5 text-left">Affiliation</th>
                <th className="px-2 py-1.5 text-right w-16">Stage1</th>
                <th className="px-2 py-1.5 text-right w-16">Stage2</th>
                <th className="px-2 py-1.5 text-right w-16">Total</th>
                <th className="px-2 py-1.5 text-right w-20">Adjustment</th>
                <th className="px-2 py-1.5 text-left min-w-40">Remarks</th>
                {!readOnly && <th className="px-2 py-1.5 text-center w-24">Decisions</th>}
              </tr>
            </thead>
            <tbody className="text-vscode-text">
              {finalResults.map((result) => (
                <tr
                  key={result.id}
                  className="border-b border-vscode-border hover:bg-vscode-highlight transition-colors"
                >
                  <td className="px-2 py-1.5 text-center text-base">
                    <span
                      className={
                        result.rank === 1
                          ? 'text-yellow-400 font-bold'
                          : result.rank === 2
                            ? 'text-gray-300 font-bold'
                            : result.rank === 3
                              ? 'text-amber-600 font-bold'
                              : ''
                      }
                    >
                      {result.classificationCode ?? result.rank}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-base">{result.playerName}</td>
                  <td className="px-2 py-1.5 text-base text-vscode-dimmed">{result.affiliation}</td>
                  <td className="px-2 py-1.5 text-right text-base tabular-nums">{result.stage1Total.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right text-base tabular-nums">{result.stage2Total.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right text-base font-bold tabular-nums">
                    {result.classificationCode ? '—' : result.totalScore.toFixed(1)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-base tabular-nums text-vscode-dimmed">
                    {result.scoreAdjustment > 0 ? `−${result.scoreAdjustment.toFixed(1)}` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-left text-xs text-vscode-dimmed">
                    {result.eliminatedAtShot !== undefined && (
                      <span className="block">Eliminated after shot {result.eliminatedAtShot}</span>
                    )}
                    {result.remarks || (!result.eliminatedAtShot ? '—' : null)}
                    {result.placementReviewRequired && (
                      <span className="block text-vscode-warning">Placement review required</span>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="px-2 py-1.5 text-center">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setDecisionResult(result)}
                        aria-label={`Scoring decisions for ${result.playerName}`}
                      >
                        <Scale size={13} aria-hidden="true" />
                        {result.decisionCount}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly && decisionResult && (
          <ScoringDecisionPanel
            result={decisionResult}
            resultScope="FINAL"
            onClose={() => setDecisionResult(null)}
            onChanged={() => void refreshFinalResults()}
          />
        )}
        {!readOnly && placementReviewOpen && (
          <FinalPlacementReviewPanel
            eventId={eventId}
            eventName={eventName}
            onClose={() => setPlacementReviewOpen(false)}
            onChanged={() => void refreshFinalResults()}
          />
        )}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="border-y border-vscode-border py-4">
        <p className="text-[13px] font-medium text-vscode-text">No results</p>
        <p className="mt-1 text-xs text-vscode-text-muted">Results appear when the competition ends.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="relay-filter" className="text-base text-vscode-text">
            Relay:
          </label>
          <select
            id="relay-filter"
            value={selectedRelay}
            onChange={handleRelayChange}
            className="px-2 py-1 text-base bg-vscode-input border border-vscode-border rounded text-vscode-text focus:outline-none focus:border-vscode-focus"
          >
            <option value="all">All</option>
            {availableRelays.map((relay) => (
              <option key={relay} value={relay}>
                Relay {relay}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {!readOnly && (
            <>
              <Button size="sm" onClick={handleConfirm} disabled={publishedResultIds.length === 0}>
                <CheckCircle size={14} aria-hidden="true" />
                Confirm ({publishedResultIds.length})
              </Button>
              {!isFinal && (
                <Button size="sm" variant="secondary" onClick={() => setVerificationOpen(true)}>
                  <ClipboardCheck size={14} aria-hidden="true" />
                  RTS verification
                </Button>
              )}
            </>
          )}
          <Button size="sm" onClick={handlePrint} disabled={filteredResults.length === 0 || printLoading}>
            <Printer size={14} aria-hidden="true" />
            {printLoading ? 'Opening…' : 'Print'}
          </Button>
        </div>
      </div>

      <div className="overflow-auto border border-vscode-border rounded">
        <table className="w-full text-vscode-text">
          <thead className="bg-vscode-sidebar text-base text-vscode-text">
            <tr className="border-b border-vscode-border">
              <th className="px-2 py-1.5 text-center w-12">Rank</th>
              <th className="px-2 py-1.5 text-left">Athlete</th>
              <th className="px-2 py-1.5 text-left">Affiliation</th>
              {Array.from({ length: seriesCount }, (_, i) => (
                <th key={i} className="px-2 py-1.5 text-right w-12">
                  S{i + 1}
                </th>
              ))}
              <th className="px-2 py-1.5 text-right w-16">Total</th>
              <th className="px-2 py-1.5 text-right w-20">Adjustment</th>
              <th className="px-2 py-1.5 text-left min-w-36">Remarks</th>
              <th className="px-2 py-1.5 text-center w-20">Status</th>
              {!readOnly && <th className="px-2 py-1.5 text-center w-24">Decisions</th>}
            </tr>
          </thead>
          <tbody className="text-vscode-text">
            {filteredResults.map((result) => (
              <tr key={result.id} className="border-b border-vscode-border hover:bg-vscode-highlight transition-colors">
                <td className="px-2 py-1.5 text-center text-base">
                  <span
                    className={
                      result.rank === 1
                        ? 'text-yellow-400 font-bold'
                        : result.rank === 2
                          ? 'text-gray-300 font-bold'
                          : result.rank === 3
                            ? 'text-amber-600 font-bold'
                            : ''
                    }
                  >
                    {result.classificationCode ?? result.rank}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-base">{result.playerName}</td>
                <td className="px-2 py-1.5 text-base text-vscode-dimmed">{result.affiliation}</td>
                {Array.from({ length: seriesCount }, (_, idx) => {
                  const score = result.seriesScores[idx];
                  return (
                    <td key={idx} className="px-2 py-1.5 text-right text-base tabular-nums">
                      {score !== undefined && score > 0 ? score : '-'}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right text-base font-bold tabular-nums">
                  {result.classificationCode ? '—' : result.totalScore.toFixed(1)}
                </td>
                <td className="px-2 py-1.5 text-right text-base tabular-nums text-vscode-dimmed">
                  {result.scoreAdjustment > 0 ? `−${result.scoreAdjustment.toFixed(1)}` : '—'}
                </td>
                <td className="px-2 py-1.5 text-left text-xs text-vscode-dimmed">
                  {result.remarks.length > 0 ? result.remarks.join('; ') : '—'}
                  {result.projectionIssues.length > 0 && (
                    <span className="block text-vscode-error">Projection needs review</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {result.status === 'published' && (
                    <span className="inline-block text-xs font-medium text-blue-300">Published</span>
                  )}
                  {result.status === 'confirmed' && (
                    <span className="inline-block text-xs font-medium text-vscode-success">Confirmed</span>
                  )}
                </td>
                {!readOnly && (
                  <td className="px-2 py-1.5 text-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDecisionResult(result)}
                      aria-label={`Scoring decisions for ${result.playerName}`}
                    >
                      <Scale size={13} aria-hidden="true" />
                      {result.decisionCount}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && decisionResult && (
        <ScoringDecisionPanel
          result={decisionResult}
          resultScope="QUALIFICATION"
          onClose={() => setDecisionResult(null)}
          onChanged={refreshQualificationResults}
        />
      )}
      {!readOnly && !isFinal && verificationOpen && (
        <ResultVerificationPanel eventId={eventId} eventName={eventName} onClose={() => setVerificationOpen(false)} />
      )}
    </div>
  );
}

import { CheckCircle, ClipboardCheck, FileClock, Printer, Scale } from 'lucide-react';
import { useEffect, useState, useMemo, useCallback } from 'react';

import { boardService } from '@/renderer/services';
import type { FinalRankedResultDto, RankedResultDto } from '@/shared/ipc/contracts';
import { Logger } from '@/shared/logging';
import { classificationSuppressesScore } from '@/shared/utils/resultClassification';

import { useFinalResults, useResults } from '../../hooks/useResults';
import { useNotificationStore } from '../../stores/ui/notifications.store';
import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';

import { EstBackupVerificationPanel } from '../est-backup-verification/EstBackupVerificationPanel';
import { FinalPlacementReviewPanel } from '../final-placement-review/FinalPlacementReviewPanel';
import { FinalResultDeclarationPanel } from '../result-publication/FinalResultDeclarationPanel';
import { MixedTeamFinalResultsTable } from '../team-results/MixedTeamFinalResultsTable';
import { ResultPublicationPanel } from '../result-publication/ResultPublicationPanel';
import { ResultVerificationPanel } from '../result-verification/ResultVerificationPanel';
import { ScoringDecisionPanel } from '../scoring-decisions/ScoringDecisionPanel';
import { TeamResultsPanel } from '../team-results/TeamResultsPanel';

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
    confirmError,
    getEventResults,
    getRelayResults,
    confirmResults,
    clearResults,
  } = useResults();

  const {
    results: finalResults,
    mixedTeamResults: mixedFinalResults,
    loading: finalLoading,
    error: finalError,
    load: loadFinalResults,
    refresh: refreshFinalResults,
    cancel: cancelFinalResults,
  } = useFinalResults(eventId);

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
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [finalDeclarationOpen, setFinalDeclarationOpen] = useState(false);
  const [placementReviewOpen, setPlacementReviewOpen] = useState(false);
  const [teamResultsOpen, setTeamResultsOpen] = useState(false);
  const [backupVerificationOpen, setBackupVerificationOpen] = useState(false);

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
    setPublicationOpen(false);
    setVerificationOpen(false);
    setFinalDeclarationOpen(false);
    setTeamResultsOpen(false);
    setBackupVerificationOpen(false);
  }, [eventId, isFinal, clearResults]);

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
      void loadFinalResults();
    } else {
      if (selectedRelay === 'all') {
        void getEventResults(eventId).then((data) => {
          if (cancelled || !data) return;
          const relays = new Set(data.results.map((result) => result.relayNumber));
          setAvailableRelays(Array.from(relays).sort((a, b) => a - b));
        });
      } else {
        void getRelayResults(eventId, selectedRelay);
      }
    }
    return () => {
      cancelled = true;
      if (isFinal) cancelFinalResults();
    };
  }, [eventId, selectedRelay, isFinal, getEventResults, getRelayResults, loadFinalResults, cancelFinalResults]);

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

  const refreshQualificationResults = useCallback(() => {
    if (selectedRelay === 'all') {
      void getEventResults(eventId);
    } else {
      void getRelayResults(eventId, selectedRelay);
    }
  }, [eventId, getEventResults, getRelayResults, selectedRelay]);

  const handleConfirm = useCallback(async () => {
    if (publishedResultIds.length === 0) {
      return;
    }
    const response = await confirmResults(eventId, publishedResultIds);
    if (response) refreshQualificationResults();
  }, [eventId, publishedResultIds, confirmResults, refreshQualificationResults]);

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

  const backupControls = !readOnly && (
    <div className="space-y-3">
      <Button size="sm" variant="secondary" onClick={() => setBackupVerificationOpen(true)}>
        EST backup verification
      </Button>
      {backupVerificationOpen && (
        <EstBackupVerificationPanel
          key={`${eventId}:${round}`}
          eventId={eventId}
          resultScope={isFinal ? 'FINAL' : 'QUALIFICATION'}
          initialKind={isFinal && mixedFinalResults.length > 0 ? 'MIXED_TEAM' : 'INDIVIDUAL'}
          onClose={() => setBackupVerificationOpen(false)}
        />
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <p className="border-y border-vscode-border py-4 text-[13px] text-vscode-text-muted">Loading results…</p>
        {backupControls}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <InlineError size="13px">{error}</InlineError>
        {backupControls}
      </div>
    );
  }

  if (isFinal) {
    const finalModals = !readOnly && (
      <>
        {verificationOpen && (
          <ResultVerificationPanel
            eventId={eventId}
            eventName={eventName}
            resultScope="FINAL"
            onClose={() => setVerificationOpen(false)}
          />
        )}
        {finalDeclarationOpen && (
          <FinalResultDeclarationPanel
            eventId={eventId}
            eventName={eventName}
            onClose={() => setFinalDeclarationOpen(false)}
          />
        )}
      </>
    );
    if (mixedFinalResults.length > 0) {
      return (
        <div className="space-y-3">
          {!readOnly && (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setVerificationOpen(true)}>
                <ClipboardCheck size={14} aria-hidden="true" />
                RTS verification
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setFinalDeclarationOpen(true)}>
                <FileClock size={14} aria-hidden="true" />
                Results final
              </Button>
            </div>
          )}
          <MixedTeamFinalResultsTable results={mixedFinalResults} />
          {backupControls}
          {finalModals}
        </div>
      );
    }
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
            <>
              <Button size="sm" variant="secondary" onClick={() => setPlacementReviewOpen(true)}>
                <ClipboardCheck size={14} aria-hidden="true" />
                Review placements
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setVerificationOpen(true)}>
                <ClipboardCheck size={14} aria-hidden="true" />
                RTS verification
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setFinalDeclarationOpen(true)}>
                <FileClock size={14} aria-hidden="true" />
                Results final
              </Button>
            </>
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

        {backupControls}

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
                    <span className={medalRankClass(result.rank)}>{result.classificationCode ?? result.rank}</span>
                  </td>
                  <td className="px-2 py-1.5 text-base">{result.playerName}</td>
                  <td className="px-2 py-1.5 text-base text-vscode-dimmed">{result.affiliation}</td>
                  <td className="px-2 py-1.5 text-right text-base tabular-nums">{result.stage1Total.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right text-base tabular-nums">{result.stage2Total.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right text-base font-bold tabular-nums">
                    {result.classificationCode ? '—' : result.totalScore.toFixed(1)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-base tabular-nums text-vscode-dimmed">
                    {formatScoreAdjustment(result.scoreAdjustment)}
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
        {finalModals}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="border-y border-vscode-border py-4">
        <p className="text-[13px] font-medium text-vscode-text">No results</p>
        <p className="mt-1 text-xs text-vscode-text-muted">Results appear when the competition ends.</p>
        {backupControls}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {confirmError && (
        <InlineError size="13px" role="alert">
          {confirmError}
        </InlineError>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="relay-filter" className="text-base text-vscode-text">
            Relay:
          </label>
          <select
            id="relay-filter"
            value={selectedRelay}
            onChange={handleRelayChange}
            className="px-2 py-1 text-base bg-vscode-input border border-vscode-border rounded text-vscode-text focus:outline-none"
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
              <Button size="sm" variant="secondary" onClick={() => setVerificationOpen(true)}>
                <ClipboardCheck size={14} aria-hidden="true" />
                RTS verification
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setPublicationOpen(true)}>
                <FileClock size={14} aria-hidden="true" />
                Publication
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setTeamResultsOpen(true)}>
                Team results
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setBackupVerificationOpen(true)}>
                EST backup
              </Button>
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
                  <span className={medalRankClass(result.rank)}>
                    {result.classificationCode ??
                      (result.entryStatus === 'COMPETING' ? result.rank : result.entryStatus)}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-base">{result.playerName}</td>
                <td className="px-2 py-1.5 text-base text-vscode-dimmed">{result.affiliation}</td>
                {Array.from({ length: seriesCount }, (_, idx) => {
                  const score = result.seriesScores[idx];
                  return (
                    <td key={idx} className="px-2 py-1.5 text-right text-base tabular-nums">
                      {classificationSuppressesScore(result.classificationCode ?? result.entryStatus)
                        ? '—'
                        : score !== undefined && score > 0
                          ? score
                          : '-'}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right text-base font-bold tabular-nums">
                  {classificationSuppressesScore(result.classificationCode ?? result.entryStatus)
                    ? '—'
                    : result.totalScore.toFixed(1)}
                </td>
                <td className="px-2 py-1.5 text-right text-base tabular-nums text-vscode-dimmed">
                  {formatScoreAdjustment(result.scoreAdjustment)}
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
      {!readOnly && verificationOpen && (
        <ResultVerificationPanel
          eventId={eventId}
          eventName={eventName}
          resultScope="QUALIFICATION"
          onClose={() => setVerificationOpen(false)}
        />
      )}
      {!readOnly && publicationOpen && (
        <ResultPublicationPanel eventId={eventId} eventName={eventName} onClose={() => setPublicationOpen(false)} />
      )}
      {teamResultsOpen && <TeamResultsPanel eventId={eventId} onClose={() => setTeamResultsOpen(false)} />}
      {backupVerificationOpen && (
        <EstBackupVerificationPanel
          key={`${eventId}:${round}`}
          eventId={eventId}
          onClose={() => setBackupVerificationOpen(false)}
        />
      )}
    </div>
  );
}

function medalRankClass(rank: number): string {
  if (rank === 1) return 'text-yellow-400 font-bold';
  if (rank === 2) return 'text-gray-300 font-bold';
  if (rank === 3) return 'text-amber-600 font-bold';
  return '';
}

/** A deduction shows as `−`, an addition as `+`, and no adjustment as `—`. */
function formatScoreAdjustment(adjustment: number): string {
  return adjustment === 0 ? '—' : `${adjustment > 0 ? '−' : '+'}${Math.abs(adjustment).toFixed(1)}`;
}

import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';

import type { ResultScope, VerificationResultItemDto } from '@/shared/ipc/contracts';

import { PublicationReviewPolicyPanel } from '../result-publication/PublicationReviewPolicyPanel';
import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';
import { Modal } from '../shared/common/Modal';
import { SummaryCard } from '../shared/common/SummaryCard';

import { ResultSignOffForm } from './ResultSignOffForm';
import { useResultVerification } from './useResultVerification';
import {
  initialCheckDraft,
  reviewCheckDraft,
  VerificationCheckForm,
  type VerificationCheckDraft,
} from './VerificationCheckForm';

interface ResultVerificationPanelProps {
  eventId: string;
  eventName?: string;
  resultScope: ResultScope;
  onClose: () => void;
}

export function ResultVerificationPanel({ eventId, eventName, resultScope, onClose }: ResultVerificationPanelProps) {
  const { status, requiredResults, selectedResult, selectResult, loading, saving, error, loadStatus, commands } =
    useResultVerification(eventId, resultScope);
  const [checkDraft, setCheckDraft] = useState<VerificationCheckDraft>(initialCheckDraft);
  const [showReviewPolicy, setShowReviewPolicy] = useState(false);

  const review = (result: VerificationResultItemDto) => {
    selectResult(result.resultId);
    setCheckDraft((draft) => reviewCheckDraft(draft, result));
  };

  return (
    <Modal isOpen onClose={onClose} title={`RTS result verification${eventName ? ` — ${eventName}` : ''}`} size="xl">
      <div className="space-y-5">
        <Button size="sm" variant="secondary" disabled={saving} onClick={() => setShowReviewPolicy((value) => !value)}>
          {showReviewPolicy ? 'Hide event review settings' : 'Event review settings'}
        </Button>
        {showReviewPolicy && (
          <PublicationReviewPolicyPanel
            key={`${eventId}:${resultScope}`}
            eventId={eventId}
            resultScope={resultScope}
            onChanged={loadStatus}
          />
        )}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Required individual checks"
            value={`${status?.checkedIndividualResults ?? 0} / ${status?.requiredIndividualChecks ?? 0}`}
          />
          <SummaryCard
            label={resultScope === 'FINAL' ? 'Final results complete' : 'All results confirmed'}
            value={status?.allResultsConfirmed ? 'Yes' : 'No'}
          />
          <SummaryCard
            label="Independent team checks"
            value={
              status && status.configuredTeamChecks > 0
                ? status.teamVerificationSupported
                  ? `${status.checkedTeamResults} / ${status.requiredTeamChecks}`
                  : 'Unsupported'
                : 'Not required'
            }
          />
          <SummaryCard
            label="RTS Jury approval"
            value={
              status?.currentApproval
                ? 'Current'
                : status?.approvalHistory.some((entry) => entry.active)
                  ? 'Stale'
                  : 'None'
            }
          />
        </section>

        {error && (
          <InlineError as="div" size="13px">
            {error}
          </InlineError>
        )}
        {loading && <p className="text-[13px] text-vscode-text-muted">Loading verification status…</p>}

        {status && status.issues.length > 0 && (
          <div className="rounded-[3px] border border-vscode-warning/50 bg-vscode-warning/5 p-3 text-xs text-vscode-text">
            <div className="flex items-center gap-2 font-semibold">
              <TriangleAlert size={14} aria-hidden="true" /> Approval requirements
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-vscode-text-muted">
              {status.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        {status && status.configuredTeamChecks > 0 && (
          <div className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3 text-xs text-vscode-text-muted">
            ISSF 6.14.8 team comparison is supplied by the EST backup workflow. Only a verified printout or
            independent-memory run for the current top-team snapshot qualifies; use{' '}
            <span className="font-medium text-vscode-text">EST backup</span> on the results toolbar to append one.
          </div>
        )}

        {status && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-semibold text-vscode-text">ISSF 6.14.8 required result checks</h3>
              <span className="text-xs text-vscode-text-muted">Top {status.configuredIndividualChecks}</span>
            </div>
            <div className="overflow-auto rounded-[3px] border border-vscode-border">
              <table className="w-full text-xs text-vscode-text">
                <thead className="bg-vscode-sidebar">
                  <tr className="border-b border-vscode-border">
                    <th className="px-2 py-2 text-center">Rank</th>
                    <th className="px-2 py-2 text-left">Athlete</th>
                    <th className="px-2 py-2 text-right">Score</th>
                    <th className="px-2 py-2 text-left">Stored evidence</th>
                    <th className="px-2 py-2 text-center">Interventions</th>
                    <th className="px-2 py-2 text-center">Check</th>
                    <th className="px-2 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {requiredResults.map((result) => (
                    <tr key={result.resultId} className="border-b border-vscode-border last:border-b-0">
                      <td className="px-2 py-2 text-center tabular-nums">{result.rank}</td>
                      <td className="px-2 py-2">
                        <span className="font-medium">{result.playerName}</span>
                        <span className="block text-vscode-text-muted">{result.affiliation}</span>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">
                        {result.totalScore.toFixed(1)}
                      </td>
                      <td className="px-2 py-2 text-vscode-text-muted">
                        linked {result.evidenceSummary.linkedShots}/{result.evidenceSummary.expectedShots}
                        <span className="block">
                          decimal {result.evidenceSummary.independentDecimalShots} · inner ten{' '}
                          {result.evidenceSummary.innerTenClassifiedShots} · conflicts{' '}
                          {result.evidenceSummary.scoreConflicts}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums">{result.decisionCount}</td>
                      <td className="px-2 py-2 text-center">
                        <CheckStatus result={result} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={result.status !== 'confirmed'}
                          onClick={() => review(result)}
                        >
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {requiredResults.length === 0 && (
              <p className="text-xs text-vscode-text-muted">No ranked qualification result is available.</p>
            )}
          </section>
        )}

        {selectedResult && (
          <VerificationCheckForm
            eventId={eventId}
            resultScope={resultScope}
            result={selectedResult}
            draft={checkDraft}
            saving={saving}
            onChange={(patch) => setCheckDraft((draft) => ({ ...draft, ...patch }))}
            onSubmit={commands.addCheck}
          />
        )}

        {status && (
          <ResultSignOffForm
            eventId={eventId}
            resultScope={resultScope}
            status={status}
            saving={saving}
            commands={commands}
          />
        )}
      </div>
    </Modal>
  );
}

function CheckStatus({ result }: { result: VerificationResultItemDto }) {
  if (result.currentCheck?.qualifies) return <span className="text-vscode-success">Matched</span>;
  if (result.currentCheck) return <span className="text-vscode-warning">{result.currentCheck.comparisonStatus}</span>;
  if (result.latestCheck) return <span className="text-vscode-warning">Stale</span>;
  return <span className="text-vscode-text-muted">Unchecked</span>;
}

import { useCallback, useEffect, useState } from 'react';

import { teamResultsService } from '@/renderer/services';
import type { TeamResultDto, TeamResultFormatDto } from '@/shared/ipc/contracts';
import { Button } from '../../shared/common/Button';

export function TeamResultsPanel({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [format, setFormat] = useState<TeamResultFormatDto>('THREE_MEMBER');
  const [results, setResults] = useState<TeamResultDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await teamResultsService.getQualification({ eventId, format });
      if (!response.success) throw new Error(response.error.message);
      setResults(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load team results');
    } finally {
      setLoading(false);
    }
  }, [eventId, format]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-vscode-text">Official team projection</h3>
          <p className="mt-0.5 text-xs text-vscode-text-muted">ISSF 3.3.2.3, 6.15.5 and 6.18 composition checks.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Team result format"
            value={format}
            onChange={(event) => setFormat(event.target.value as TeamResultFormatDto)}
            className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2 text-xs text-vscode-text"
          >
            <option value="THREE_MEMBER">3-member Team</option>
            <option value="MIXED_PAIR">Mixed Team pair</option>
          </select>
          <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </header>

      {loading && <p className="text-xs text-vscode-text-muted">Calculating team results…</p>}
      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}
      {!loading && !error && results.length === 0 && (
        <p className="text-xs text-vscode-text-muted">No participants have a Team ID for this event.</p>
      )}
      {results.length > 0 && (
        <div className="overflow-auto border border-vscode-border">
          <table className="w-full text-xs text-vscode-text">
            <thead className="bg-vscode-sidebar">
              <tr className="border-b border-vscode-border">
                <th className="px-2 py-1.5 text-center">Rank</th>
                <th className="px-2 py-1.5 text-left">Team</th>
                <th className="px-2 py-1.5 text-left">NOC</th>
                <th className="px-2 py-1.5 text-left">Members</th>
                <th className="px-2 py-1.5 text-right">Total</th>
                <th className="px-2 py-1.5 text-left">Checks</th>
              </tr>
            </thead>
            <tbody>
              {results.map((team) => (
                <tr key={team.teamId} className="border-b border-vscode-border align-top">
                  <td className="px-2 py-1.5 text-center font-semibold">{team.rank || '—'}</td>
                  <td className="px-2 py-1.5">
                    {team.teamName}
                    <span className="block text-vscode-dimmed">{team.teamId}</span>
                  </td>
                  <td className="px-2 py-1.5">{team.nationCode ?? '—'}</td>
                  <td className="px-2 py-1.5">
                    {team.members.map((member) => (
                      <span key={member.participantId} className="block">
                        {member.playerName} ({member.gender}) · {member.totalScore?.toFixed(1) ?? 'no result'}
                      </span>
                    ))}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{team.totalScore.toFixed(1)}</td>
                  <td className="px-2 py-1.5">
                    {team.eligible ? (
                      <span className={team.unresolvedTie ? 'text-vscode-warning' : 'text-vscode-success'}>
                        {team.unresolvedTie ? 'Unresolved tie — same rank' : 'Eligible'}
                      </span>
                    ) : (
                      team.issues.map((issue) => (
                        <span key={issue} className="block text-vscode-error">
                          {issue}
                        </span>
                      ))
                    )}
                    {team.tieEvidence.manualReviewRequired && (
                      <span className="block text-vscode-warning">
                        Tie evidence includes scoring decisions; Jury review required.
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

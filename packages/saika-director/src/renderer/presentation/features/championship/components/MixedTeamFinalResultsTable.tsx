import type { MixedTeamFinalResultDto } from '@/shared/ipc/contracts';

/** The Mixed Team Final places with each team's members and decision. */
export function MixedTeamFinalResultsTable({ results }: { results: MixedTeamFinalResultDto[] }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[13px] font-semibold text-vscode-text">Mixed Team Final results</h3>
        <p className="mt-0.5 text-xs text-vscode-text-muted">
          Team totals combine the two athletes’ recorded Lane scores. Places follow the recorded Final decisions.
        </p>
      </div>
      <div className="overflow-auto rounded border border-vscode-border">
        <table className="w-full text-vscode-text">
          <thead className="bg-vscode-sidebar text-base">
            <tr className="border-b border-vscode-border">
              <th className="w-12 px-2 py-1.5 text-center">Rank</th>
              <th className="px-2 py-1.5 text-left">Team</th>
              <th className="px-2 py-1.5 text-left">NOC</th>
              <th className="px-2 py-1.5 text-left">Members</th>
              <th className="w-20 px-2 py-1.5 text-right">Stage 1</th>
              <th className="w-20 px-2 py-1.5 text-right">Stage 2</th>
              <th className="w-20 px-2 py-1.5 text-right">Total</th>
              <th className="min-w-40 px-2 py-1.5 text-left">Decision</th>
            </tr>
          </thead>
          <tbody>
            {results.map((team) => (
              <tr key={team.id} className="border-b border-vscode-border align-top">
                <td className="px-2 py-1.5 text-center font-bold">{team.rank}</td>
                <td className="px-2 py-1.5">
                  {team.teamName}
                  <span className="block text-xs text-vscode-dimmed">{team.teamId}</span>
                </td>
                <td className="px-2 py-1.5">{team.nationCode}</td>
                <td className="px-2 py-1.5">
                  {team.members.map((member) => (
                    <span key={member.participantId} className="block text-xs">
                      {member.gender} · FP {member.firingPointNumber} · {member.playerName} ·{' '}
                      {member.totalScore.toFixed(1)}
                    </span>
                  ))}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{team.stage1Total.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{team.stage2Total.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums">{team.totalScore.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-xs text-vscode-dimmed">
                  {team.eliminatedAtShot ? `Placed after shot ${team.eliminatedAtShot}` : 'Winner'}
                  {team.remarks && <span className="block">{team.remarks}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

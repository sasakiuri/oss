import type { LiveRankingDto } from '@/shared/types/LiveRankingDto';
import { Trophy } from 'lucide-react';

interface RankingTableProps {
  rankings: LiveRankingDto[];
  showAverage?: boolean;
}

export function RankingTable({ rankings, showAverage = true }: RankingTableProps) {
  if (rankings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-vscode-dimmed">
        <Trophy size={48} className="mb-4 opacity-50" />
        <div className="text-lg">No ranking data</div>
        <div className="text-base mt-2">Data will appear after the competition starts</div>
      </div>
    );
  }

  const seriesCount = Math.max(...rankings.map((entry) => entry.seriesScores.length));

  return (
    <div className="overflow-auto border border-vscode-border rounded-lg">
      <table className="w-full text-vscode-text">
        <thead className="bg-vscode-sidebar text-base sticky top-0 text-vscode-text">
          <tr className="border-b border-vscode-border">
            <th className="px-3 py-2 text-center w-16">Lane</th>
            <th className="px-3 py-2 text-left">Athlete</th>
            <th className="px-3 py-2 text-left">Affiliation</th>
            {Array.from({ length: seriesCount }, (_, index) => (
              <th key={index} className="px-3 py-2 text-right w-16">
                S{index + 1}
              </th>
            ))}
            <th className="px-3 py-2 text-right w-20">Total</th>
            {showAverage && <th className="px-3 py-2 text-right w-16">Average</th>}
          </tr>
        </thead>
        <tbody className="text-vscode-text">
          {rankings.map((entry) => (
            <tr
              key={entry.laneId}
              className="border-b border-vscode-border hover:bg-vscode-highlight transition-colors"
            >
              {/* Channel */}
              <td className="px-3 py-2 text-center">
                <span className="font-mono text-blue-400">CH{entry.channel.toString().padStart(2, '0')}</span>
              </td>

              {/* Player Name */}
              <td className="px-3 py-2">
                <span className="font-medium truncate">{entry.playerName || 'Unregistered'}</span>
              </td>

              {/* Affiliation */}
              <td className="px-3 py-2 text-vscode-dimmed truncate">{entry.affiliation || '-'}</td>

              {/* Series scores */}
              {Array.from({ length: seriesCount }, (_, i) => (
                <td key={i} className="px-3 py-2 text-right font-mono tabular-nums">
                  {entry.seriesScores[i] !== undefined && entry.seriesScores[i] > 0
                    ? entry.seriesScores[i].toFixed(1)
                    : '-'}
                </td>
              ))}

              {/* Total Score */}
              <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-lg">
                {entry.totalScore.toFixed(1)}
              </td>

              {/* Average */}
              {showAverage && (
                <td className="px-3 py-2 text-right font-mono tabular-nums text-vscode-dimmed">
                  {entry.shotCount > 0 ? entry.average.toFixed(2) : '-'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

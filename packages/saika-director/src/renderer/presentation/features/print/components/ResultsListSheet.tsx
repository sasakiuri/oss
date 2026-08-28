import type { RankedResultDto } from '@/shared/ipc/contracts/results.contract';

interface ResultsListSheetProps {
  eventName: string;
  relayNumber?: number;
  results: RankedResultDto[];
}

export function ResultsListSheet({ eventName, relayNumber, results }: ResultsListSheetProps) {
  const now = new Date();
  const formattedDate = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}`;

  return (
    <div className="results-list-sheet">
      <div className="results-list-header">
        <div className="header-title">
          <h1>{eventName}</h1>
          {relayNumber !== undefined && <h2>Relay {relayNumber}</h2>}
        </div>
        <div className="header-date">{formattedDate}</div>
      </div>

      <table className="results-list-table">
        <thead>
          <tr>
            <th className="col-rank">Rank</th>
            <th className="col-name">Athlete</th>
            <th className="col-affiliation">Affiliation</th>
            <th className="col-series">S1</th>
            <th className="col-series">S2</th>
            <th className="col-series">S3</th>
            <th className="col-series">S4</th>
            <th className="col-series">S5</th>
            <th className="col-series">S6</th>
            <th className="col-total">Total</th>
            <th className="col-remarks">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.id}>
              <td className="col-rank">{result.classificationCode ?? result.rank}</td>
              <td className="col-name">{result.playerName}</td>
              <td className="col-affiliation">{result.affiliation}</td>
              {result.seriesScores.map((score, idx) => (
                <td key={idx} className="col-series">
                  {score > 0 ? score : '-'}
                </td>
              ))}
              <td className="col-total">{result.classificationCode ? '—' : result.totalScore.toFixed(1)}</td>
              <td className="col-remarks">{result.remarks.join('; ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

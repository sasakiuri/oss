import type { ScoreSheetDto, ScoreSheetShotDto } from '@/shared/ipc/contracts/laneControl.contract';

interface ScoreSheetProps {
  data: ScoreSheetDto;
}

export function ScoreSheet({ data }: ScoreSheetProps) {
  const seriesCount = Math.max(data.seriesScores.length, ...data.allShots.map((shot) => shot.seriesNumber));
  const now = new Date();
  const formattedDate = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}`;

  const relayChannel = `${data.relay}-${data.channel}`;

  const shotValueCounts = Array(11).fill(0);
  data.allShots.forEach((shot) => {
    const intVal = shot.integerValue;
    if (intVal >= 0 && intVal <= 10) {
      shotValueCounts[10 - intVal]++;
    }
  });

  const getSeriesShots = (seriesNumber: number): ScoreSheetShotDto[] => {
    return data.allShots.filter((s) => s.seriesNumber === seriesNumber).sort((a, b) => a.shotNumber - b.shotNumber);
  };

  const getSeriesIntegerScore = (seriesNumber: number): number => {
    const shots = getSeriesShots(seriesNumber);
    return shots.reduce((sum, shot) => sum + shot.integerValue, 0);
  };

  const formatShotValue = (shot: ScoreSheetShotDto | undefined): string => {
    if (!shot) return '-';
    if (shot.disposition === 'MISS') return 'M';
    return shot.value.toFixed(1);
  };

  return (
    <div className="score-sheet">
      {(data.championshipName || data.venue) && (
        <div className="score-sheet-championship">
          {data.championshipName}
          {data.championshipName && data.venue && ' / '}
          {data.venue}
        </div>
      )}

      <div className="score-sheet-header-3col">
        <div className="header-left">
          <div className="header-line">{data.eventName || ''}</div>
          <div className="header-line">Lane: {relayChannel}</div>
          <div className="header-line player-name">
            {data.playerName}
            {data.affiliation && ` – ${data.affiliation}`}
          </div>
        </div>

        <div className="header-center">
          <div className="header-line">&nbsp;</div>
          <div className="header-line">&nbsp;</div>
          <div className="header-line">&nbsp;</div>
        </div>

        <div className="header-right">
          <div className="header-line">&nbsp;</div>
          <div className="header-line">{formattedDate}</div>
          <div className="header-line">&nbsp;</div>
        </div>
      </div>

      <div className="score-sheet-summary">
        <div className="summary-content">
          <div className="summary-row result-row">
            <span className="summary-label">Result:</span>
            <span className="summary-value result-value">
              <span className="decimal-main">{data.totalScore.toFixed(1)}</span>
              <span className="integer-sub">({data.totalIntegerScore})</span>
            </span>
          </div>

          <div className="summary-row series-row">
            <span className="summary-label">Series:</span>
            <span className="summary-value series-values">
              {data.seriesScores.map((decimalScore, index) => {
                const intScore = getSeriesIntegerScore(index + 1);
                return (
                  <span key={index} className="series-score">
                    {decimalScore > 0 ? (
                      <>
                        <span className="decimal-main">{decimalScore.toFixed(1)}</span>
                        <span className="integer-sub">({intScore})</span>
                      </>
                    ) : (
                      '-'
                    )}
                  </span>
                );
              })}
            </span>
          </div>

          <div className="zaehler-section">
            <span className="summary-label">Zähler:</span>
            <div className="zaehler-container">
              <div className="zaehler-row counts-row">
                {shotValueCounts.map((count, i) => (
                  <span key={i} className="zaehler-cell">
                    {count > 0 ? count : ''}
                  </span>
                ))}
              </div>
              <div className="zaehler-row labels-row">
                {Array.from({ length: 11 }, (_, i) => (
                  <span key={i} className="zaehler-cell label">
                    {10 - i}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="target-placeholder"></div>
      </div>

      <div className="series-sections-meyton">
        {Array.from({ length: seriesCount }, (_, seriesIndex) => {
          const seriesNumber = seriesIndex + 1;
          const seriesShots = getSeriesShots(seriesNumber);
          const intScore = getSeriesIntegerScore(seriesNumber);
          const decimalScore = data.seriesScores[seriesIndex];

          return (
            <div key={seriesNumber} className="series-block">
              <div className="series-target">
                <div className="target-circle outer" />
                <div className="target-circle inner" />
                <div className="target-circle center" />
              </div>

              <div className="series-info">
                <div className="series-header">
                  Serie {seriesNumber}:{' '}
                  {decimalScore !== undefined && decimalScore > 0 ? (
                    <>
                      <span className="score-int">{intScore}</span>
                      <span className="score-dec">({decimalScore.toFixed(1)})</span>
                    </>
                  ) : (
                    '-'
                  )}
                </div>
                <div className="shots-grid-5x2">
                  {Array.from({ length: Math.max(2, Math.ceil(seriesShots.length / 5)) }, (_, rowIdx) => (
                    <div key={rowIdx} className="shots-row">
                      {Array.from({ length: 5 }, (_, colIdx) => {
                        const shotIdx = rowIdx * 5 + colIdx;
                        const shot = seriesShots[shotIdx];
                        return (
                          <span key={colIdx} className="shot-value">
                            {formatShotValue(shot)}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// SPDX-License-Identifier: MIT

import type { ScoreSheetDto } from '@/shared/ipc/contracts';

import {
  countShotValues,
  extractSeriesNumbers,
  formatShotValue,
  getSeriesIntegerScore,
  getSeriesShots,
} from '../scoreSheetUtils';

import { SeriesTargetCanvas } from './SeriesTargetCanvas';

/** Must match the CSS variable --series-target-size */
const SERIES_TARGET_SIZE = 125;

interface ScoreSheetProps {
  data: ScoreSheetDto;
}

export function ScoreSheet({ data }: ScoreSheetProps) {
  const now = new Date();
  const formattedDate = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}`;
  const laneDisplay = data.relay > 0 ? `${data.relay}-${data.laneNumber}` : `${data.laneNumber}`;

  const shotValueCounts = countShotValues(data.allShots);
  const seriesNumbers = extractSeriesNumbers(data.allShots);
  const displaySeriesCount = Math.max(6, seriesNumbers.length);

  return (
    <div className="score-sheet">
      {/* Header: 3-column layout */}
      <div className="score-sheet-header-3col">
        <div className="header-left">
          <div className="header-line">{data.disciplineName || ''}</div>
          <div className="header-line">Lane: {laneDisplay}</div>
          <div className="header-line player-name">
            {data.playerName || ''}
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

      {/* Summary section */}
      <div className="score-sheet-summary">
        <div className="summary-content">
          <div className="summary-row result-row">
            <span className="summary-label">Result:</span>
            <span className="summary-value result-value">
              <span className="decimal-main">{(data.totalScore / 10).toFixed(1)}</span>
              <span className="integer-sub">({data.totalIntegerScore})</span>
            </span>
          </div>

          <div className="summary-row series-row">
            <span className="summary-label">Series:</span>
            <span className="summary-value series-values">
              {data.seriesScores.map((decimalScore, index) => {
                const sn = seriesNumbers[index];
                const intScore = sn !== undefined ? getSeriesIntegerScore(data.allShots, sn) : 0;
                return (
                  <span key={index} className="series-score">
                    {decimalScore > 0 ? (
                      <>
                        <span className="decimal-main">{(decimalScore / 10).toFixed(1)}</span>
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
            <span className="summary-label">Score breakdown:</span>
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
        <SeriesTargetCanvas shots={data.allShots} discipline={data.discipline} size={120} sequentialShotNumbers />
      </div>

      {/* Series details */}
      <div className="series-sections-meyton">
        {Array.from({ length: displaySeriesCount }, (_, seriesIndex) => {
          const seriesNumber = seriesNumbers[seriesIndex];
          const seriesShots = seriesNumber !== undefined ? getSeriesShots(data.allShots, seriesNumber) : [];
          const intScore = seriesNumber !== undefined ? getSeriesIntegerScore(data.allShots, seriesNumber) : 0;
          const decimalScore = data.seriesScores[seriesIndex];

          return (
            <div key={seriesIndex} className={`series-block${seriesIndex === 6 ? 'series-page-break' : ''}`}>
              <div className="series-target">
                <SeriesTargetCanvas shots={seriesShots} discipline={data.discipline} size={SERIES_TARGET_SIZE} />
              </div>
              <div className="series-info">
                <div className="series-header">
                  Series {seriesIndex + 1}:{' '}
                  {decimalScore !== undefined && decimalScore > 0 ? (
                    <>
                      <span className="score-int">{intScore}</span>
                      <span className="score-dec">({(decimalScore / 10).toFixed(1)})</span>
                    </>
                  ) : (
                    '-'
                  )}
                </div>
                <div className="shots-grid-5x2">
                  {Array.from({ length: 2 }, (_, rowIdx) => (
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

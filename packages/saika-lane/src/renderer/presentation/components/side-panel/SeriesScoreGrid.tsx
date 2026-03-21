// SPDX-License-Identifier: MIT
/**
 * SeriesScoreGrid — Series score display (P6 section, 3 columns x N rows)
 */

import React, { memo, useEffect, useRef } from 'react';

const SCROLL_THRESHOLD_PX = 50;
const SERIES_COLUMNS = 3;

export interface SeriesScoreGridProps {
  scores: readonly number[];
  acc: 'RING' | 'DECIMAL';
}

export const SeriesScoreGrid: React.FC<SeriesScoreGridProps> = memo(({ scores, acc }) => {
  const seriesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (seriesRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = seriesRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD_PX;
      if (isNearBottom || scrollTop === 0) {
        seriesRef.current.scrollTop = scrollHeight;
      }
    }
  }, [scores]);

  const seriesRows: number[][] = [];
  for (let i = 0; i < scores.length; i += SERIES_COLUMNS) {
    seriesRows.push(scores.slice(i, i + SERIES_COLUMNS));
  }

  return (
    <div className="flex h-40 flex-col overflow-y-auto border-b border-zinc-500 px-2 py-2" ref={seriesRef}>
      <div className="flex flex-col gap-1">
        {seriesRows.length === 0 ? (
          <span className="text-3xl italic text-zinc-500"></span>
        ) : (
          seriesRows.map((row, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-3 gap-1">
              {row.map((score, colIndex) => (
                <div key={colIndex} className="flex items-center justify-center rounded px-1 py-1">
                  <span className="font-mono text-4xl font-semibold text-zinc-100">
                    {acc === 'RING' ? String(Math.floor(score / 10)) : (score / 10).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
});

// SPDX-License-Identifier: MIT
import React, { memo, useLayoutEffect, useRef } from 'react';

const SCROLL_THRESHOLD_PX = 50;
const SERIES_COLUMNS = 3;

export interface SeriesScoreGridProps {
  scores: readonly number[];
  acc: 'RING' | 'DECIMAL';
}

export const SeriesScoreGrid: React.FC<SeriesScoreGridProps> = memo(({ scores, acc }) => {
  const seriesRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);

  useLayoutEffect(() => {
    const viewport = seriesRef.current;
    if (viewport && (followLatestRef.current || viewport.scrollHeight <= viewport.clientHeight)) {
      viewport.scrollTop = viewport.scrollHeight;
      followLatestRef.current = true;
    }
  }, [scores]);

  const seriesRows: number[][] = [];
  for (let i = 0; i < scores.length; i += SERIES_COLUMNS) {
    seriesRows.push(scores.slice(i, i + SERIES_COLUMNS));
  }

  return (
    <div className="border-b border-zinc-500 px-2 py-2">
      <div
        className="h-[6.25rem] snap-y snap-mandatory overflow-y-auto overscroll-contain"
        role="region"
        aria-label="Series scores"
        tabIndex={0}
        ref={seriesRef}
        onScroll={(event) => {
          const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
          followLatestRef.current = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD_PX;
        }}
      >
        {/* Two 3rem rows and the 0.25rem gap fit the viewport exactly. */}
        <div className="flex flex-col gap-1">
          {seriesRows.length === 0 ? (
            <span className="text-3xl italic text-zinc-500"></span>
          ) : (
            seriesRows.map((row, rowIndex) => (
              <div key={rowIndex} className="grid h-12 shrink-0 snap-start grid-cols-3 gap-1">
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
    </div>
  );
});

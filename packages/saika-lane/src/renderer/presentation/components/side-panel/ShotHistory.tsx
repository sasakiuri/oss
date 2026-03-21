// SPDX-License-Identifier: MIT
/**
 * ShotHistory — Latest shot list (P5 section)
 */

import React, { memo, useEffect, useRef } from 'react';

import { toArrowDirection } from '../../utils/scoreUtils';

interface ShotHistoryItem {
  shotNumber: number;
  score: number;
  x: number | null;
  y: number | null;
}

export interface ShotHistoryProps {
  shots: readonly ShotHistoryItem[];
  /** Scoring method (RING=integer display, DECIMAL=decimal display). Defaults to DECIMAL */
  acc?: 'RING' | 'DECIMAL';
}

export const ShotHistory: React.FC<ShotHistoryProps> = memo(({ shots, acc = 'DECIMAL' }) => {
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = 0;
    }
  }, [shots]);

  return (
    <div className="flex-1 overflow-y-auto border-b border-zinc-500 px-2 py-2" ref={historyRef}>
      <div className="flex flex-col gap-1">
        {shots.length === 0 ? (
          <span className="text-sm italic text-zinc-500"></span>
        ) : (
          <>
            {shots.map((shot, index) => (
              <div key={shot.shotNumber} className={`grid grid-cols-3 gap-1 ${index === 0 ? 'text-4xl' : 'text-4xl'}`}>
                <span className="text-zinc-400">{shot.shotNumber}</span>
                <span className="text-right font-mono font-semibold tabular-nums text-zinc-100">
                  {acc === 'RING' ? String(Math.floor(shot.score / 10)) : (shot.score / 10).toFixed(1)}
                </span>
                <span className="text-right font-mono tabular-nums text-zinc-300">
                  {toArrowDirection(shot.x, shot.y)}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
});

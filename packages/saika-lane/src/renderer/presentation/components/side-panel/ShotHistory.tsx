// SPDX-License-Identifier: MIT
import React, { memo, useEffect, useRef } from 'react';

import type { NullifiedExtraDto } from '@/shared/ipc/contracts';

import { toArrowDirection } from '../../utils/scoreUtils';

interface ShotHistoryItem {
  id: string;
  shotNumber: number;
  score: number;
  x: number | null;
  y: number | null;
  timestamp?: string;
  receivedAt?: string;
  reportedMode?: 'SIGHTING' | 'MATCH' | null;
}

export interface ShotHistoryProps {
  shots: readonly ShotHistoryItem[];
  nullifiedExtras?: readonly NullifiedExtraDto[];
  acc?: 'RING' | 'DECIMAL';
}

export const ShotHistory: React.FC<ShotHistoryProps> = memo(({ shots, nullifiedExtras = [], acc = 'DECIMAL' }) => {
  const historyRef = useRef<HTMLDivElement>(null);
  const rows = [
    ...shots.map((shot) => ({ kind: 'shot' as const, value: shot, time: shot.receivedAt ?? shot.timestamp })),
    ...nullifiedExtras.map((extra) => ({ kind: 'extra' as const, value: extra, time: extra.receivedAt })),
  ]
    .sort((left, right) => (right.time ? Date.parse(right.time) : 0) - (left.time ? Date.parse(left.time) : 0))
    .slice(0, 10);

  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = 0;
  }, [shots, nullifiedExtras]);

  return (
    <div className="flex-1 overflow-y-auto border-b border-zinc-500 px-2 py-2" ref={historyRef}>
      <div className="flex flex-col gap-1">
        {rows.map((row) =>
          row.kind === 'extra' ? (
            <div key={`extra-${row.value.id}`} className="border-b border-zinc-500 py-2 text-sm">
              <p>
                <span aria-label="No shot ordinal">—</span> Nullified extra — previous{' '}
                {row.value.previousPosition === 'KNEELING'
                  ? 'Kneeling'
                  : row.value.previousPosition === 'PRONE'
                    ? 'Prone'
                    : row.value.previousPosition === 'STANDING'
                      ? 'Standing'
                      : 'unknown'}{' '}
                position
              </p>
              <p>Not scored · ISSF 6.10.4(c) / 7.7.3</p>
              <p>
                Device value: {row.value.deviceScoreX10 === null ? '—' : (row.value.deviceScoreX10 / 10).toFixed(1)} ·
                Device mode: {row.value.reportedMode ?? 'Unknown'}
              </p>
            </div>
          ) : (
            <div key={row.value.id}>
              <div className="grid grid-cols-3 gap-1 text-4xl">
                <span className="text-zinc-400">{row.value.shotNumber}</span>
                <span className="text-right font-mono font-semibold tabular-nums text-zinc-100">
                  {acc === 'RING' ? String(Math.floor(row.value.score / 10)) : (row.value.score / 10).toFixed(1)}
                </span>
                <span className="text-right font-mono tabular-nums text-zinc-300">
                  {toArrowDirection(row.value.x, row.value.y)}
                </span>
              </div>
              {row.value.reportedMode && <p className="text-sm">Device mode: {row.value.reportedMode}</p>}
            </div>
          ),
        )}
      </div>
    </div>
  );
});

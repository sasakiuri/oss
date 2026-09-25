'use client';

import { TARGETS_PER_ROUND, type TrendPoint } from '@/lib/clay-score';

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { left: 36, right: 12, top: 12, bottom: 28 };
const GRID = [0, 5, 10, 15, 20, 25];

/**
 * Score per saved round, oldest on the left. One series, so no legend: the heading names it. Each
 * point carries its date and score as a tooltip, and the round list beside the chart is the table
 * view of the same numbers.
 */
export function ClayScoreTrend({
  points,
  language,
  label,
}: {
  points: readonly TrendPoint[];
  language: 'ja' | 'en';
  label: string;
}) {
  if (points.length < 2) return null;
  const date = new Intl.DateTimeFormat(language, { dateStyle: 'medium' });
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (plotWidth * index) / (points.length - 1);
  const y = (hits: number) => PAD.top + plotHeight * (1 - hits / TARGETS_PER_ROUND);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.hits)}`).join(' ');
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label} className="h-auto w-full">
      {GRID.map((value) => (
        <g key={value}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(value)}
            y2={y(value)}
            className="stroke-outline-variant"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 6}
            y={y(value) + 4}
            textAnchor="end"
            className="fill-on-surface-variant text-[11px] tabular-nums"
          >
            {value}
          </text>
        </g>
      ))}
      <text x={PAD.left} y={HEIGHT - 8} className="fill-on-surface-variant text-[11px]">
        {date.format(new Date(first.savedAt))}
      </text>
      <text x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end" className="fill-on-surface-variant text-[11px]">
        {date.format(new Date(last.savedAt))}
      </text>
      <path d={path} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" />
      {points.map((point, index) => (
        <g key={point.id}>
          <circle cx={x(index)} cy={y(point.hits)} r={4} className="fill-primary stroke-surface" strokeWidth={2} />
          {/* A wider invisible target than the dot, so the tooltip is easy to reach. */}
          <circle cx={x(index)} cy={y(point.hits)} r={12} fill="transparent">
            <title>{`${date.format(new Date(point.savedAt))}: ${point.hits} / ${TARGETS_PER_ROUND}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

'use client';

import type { OuterWire, WireRow } from '@/lib/schemas/electric-fence';

interface FenceFigureProps {
  rows: readonly WireRow[];
  outerWire: OuterWire;
  label: string;
  energizedLabel: string;
  cordLabel: string;
  outerLabel: string;
}

const WIDTH = 320;
const GROUND_Y = 200;
const TOP_Y = 16;
const POST_X = [136, 236] as const;
const WIRE_X = [96, 250] as const;
// The outer line stands in front of the fence, drawn to its right, clear of the height labels.
const OUTER_POST_X = 292;

/**
 * The rows drawn to scale against the ground, as a side view. A powered wire is a solid line and an
 * unpowered cord a dashed one, and the difference is also written beside each, so colour is not the
 * only thing that tells them apart.
 */
export function FenceFigure({ rows, outerWire, label, energizedLabel, cordLabel, outerLabel }: FenceFigureProps) {
  const valid = rows.filter((row) => Number.isFinite(row.heightCm) && row.heightCm > 0);
  const outer = outerWire.enabled && Number.isFinite(outerWire.heightCm) && outerWire.heightCm > 0;
  const tallest = Math.max(40, ...valid.map((row) => row.heightCm), outer ? outerWire.heightCm : 0);
  // A round scale step, so the figure's axis reads like a tape measure.
  const topCm = Math.ceil((tallest * 1.1) / 20) * 20;
  const y = (cm: number) => GROUND_Y - (cm / topCm) * (GROUND_Y - TOP_Y);
  const sorted = [...valid].sort((a, b) => a.heightCm - b.heightCm);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${GROUND_Y + 24}`} role="img" aria-label={label} className="h-auto w-full max-w-md">
      <line
        x1={0}
        x2={WIDTH}
        y1={GROUND_Y}
        y2={GROUND_Y}
        stroke="var(--md-sys-color-on-surface-variant)"
        strokeWidth={2}
      />
      {POST_X.map((x) => (
        <rect
          key={x}
          x={x - 3}
          y={y(topCm * 0.97)}
          width={6}
          height={GROUND_Y - y(topCm * 0.97)}
          fill="var(--md-sys-color-outline)"
        />
      ))}
      {sorted.map((row, index) => (
        <g key={`${row.heightCm}-${index}`}>
          <line
            x1={WIRE_X[0]}
            x2={WIRE_X[1]}
            y1={y(row.heightCm)}
            y2={y(row.heightCm)}
            stroke={row.energized ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)'}
            strokeWidth={row.energized ? 2.5 : 1.5}
            strokeDasharray={row.energized ? undefined : '6 4'}
          />
          <text
            x={WIRE_X[0] - 6}
            y={y(row.heightCm)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={11}
            fill="var(--md-sys-color-on-surface)"
          >
            {`${row.heightCm} cm${row.energized ? '' : ` (${cordLabel})`}`}
          </text>
        </g>
      ))}
      {outer && (
        <g>
          <rect
            x={OUTER_POST_X - 2}
            y={y(outerWire.heightCm) - 6}
            width={4}
            height={GROUND_Y - y(outerWire.heightCm) + 6}
            fill="var(--md-sys-color-outline)"
          />
          <line
            x1={OUTER_POST_X - 18}
            x2={OUTER_POST_X + 18}
            y1={y(outerWire.heightCm)}
            y2={y(outerWire.heightCm)}
            stroke="var(--md-sys-color-primary)"
            strokeWidth={2.5}
          />
          <text x={WIDTH} y={GROUND_Y + 16} textAnchor="end" fontSize={11} fill="var(--md-sys-color-on-surface)">
            {`${outerLabel} ${outerWire.heightCm} cm`}
          </text>
        </g>
      )}
      <text x={0} y={GROUND_Y + 16} textAnchor="start" fontSize={11} fill="var(--md-sys-color-on-surface-variant)">
        {`— ${energizedLabel}  - - ${cordLabel}`}
      </text>
    </svg>
  );
}

'use client';

import type { Cell } from '@/lib/bear-stats';

export interface Bar {
  key: string;
  label: string;
  value: Cell;
  /** The bar the reader has picked, drawn in the accent colour. */
  selected?: boolean;
}

interface BarChartProps {
  bars: readonly Bar[];
  /** Read out for the picture; the table beside it carries the figures. */
  label: string;
  /** `columns` for a run of years or months, `rows` for a ranking with names to read. */
  layout?: 'columns' | 'rows';
  formatValue: (value: number) => string;
}

/** Rough width of a label at `size` px: full width for Japanese, about 0.6 em for Latin and digits. */
function labelWidth(text: string, size: number): number {
  return [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 0x2000 ? size : size * 0.6), 0);
}

/** A round top for the scale, so the gridlines fall on plain numbers. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * power >= max) ?? 10;
  return step * power;
}

/**
 * Bars drawn without a chart library, as one labelled image; the table beside it holds the values.
 * A figure that is not a count (not published, not compiled yet) gets a dash, not a zero-height bar.
 */
export function BarChart({ bars, label, layout = 'columns', formatValue }: BarChartProps) {
  const counts = bars.map((bar) => (typeof bar.value === 'number' ? bar.value : 0));
  const top = niceMax(Math.max(0, ...counts));
  const ticks = [0, 0.5, 1].map((fraction) => top * fraction);

  if (layout === 'rows') {
    const rowHeight = 22;
    const nameWidth = 80;
    const valueWidth = 44;
    const width = 360;
    const plotWidth = width - nameWidth - valueWidth;
    const height = Math.max(rowHeight, bars.length * rowHeight) + 4;
    return (
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full max-w-xl text-on-surface"
      >
        {bars.map((bar, index) => {
          const y = index * rowHeight + 2;
          const value = typeof bar.value === 'number' ? bar.value : null;
          const barWidth = value === null ? 0 : (value / top) * plotWidth;
          return (
            <g key={bar.key}>
              <text x={nameWidth - 8} y={y + 15} textAnchor="end" className="fill-current text-[13px]">
                {bar.label}
              </text>
              <rect
                x={nameWidth}
                y={y + 3}
                width={Math.max(barWidth, value ? 1 : 0)}
                height={rowHeight - 6}
                rx={2}
                className={bar.selected ? 'fill-tertiary' : 'fill-primary'}
              />
              <text x={nameWidth + barWidth + 6} y={y + 15} className="fill-current text-[12px] tabular-nums">
                {value === null ? '—' : formatValue(value)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  const width = 400;
  const height = 200;
  const left = 36;
  const right = 4;
  const topPad = 10;
  const bottom = 24;
  const plotWidth = width - left - right;
  const plotHeight = height - topPad - bottom;
  const slot = plotWidth / Math.max(1, bars.length);
  const barWidth = Math.max(2, slot * 0.7);
  const y = (value: number) => topPad + plotHeight - (value / top) * plotHeight;
  // Every label when they fit, otherwise every second or third, so they never run into each other.
  const widest = Math.max(0, ...bars.map((bar) => labelWidth(bar.label, 11)));
  const labelEvery = Math.max(1, Math.ceil((widest + 4) / slot));

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto w-full max-w-xl text-on-surface"
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={left}
            x2={width - right}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-outline-variant"
            strokeWidth={1}
          />
          <text
            x={left - 6}
            y={y(tick) + 4}
            textAnchor="end"
            className="fill-on-surface-variant text-[11px] tabular-nums"
          >
            {formatValue(tick)}
          </text>
        </g>
      ))}
      {bars.map((bar, index) => {
        const x = left + index * slot + (slot - barWidth) / 2;
        const value = typeof bar.value === 'number' ? bar.value : null;
        return (
          <g key={bar.key}>
            {value === null ? (
              <text
                x={x + barWidth / 2}
                y={y(0) - 4}
                textAnchor="middle"
                className="fill-on-surface-variant text-[11px]"
              >
                —
              </text>
            ) : (
              <rect
                x={x}
                y={y(value)}
                width={barWidth}
                height={Math.max(y(0) - y(value), value > 0 ? 1 : 0)}
                rx={2}
                className={bar.selected ? 'fill-tertiary' : 'fill-primary'}
              />
            )}
            {index % labelEvery === 0 && (
              <text x={x + barWidth / 2} y={height - 10} textAnchor="middle" className="fill-current text-[11px]">
                {bar.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

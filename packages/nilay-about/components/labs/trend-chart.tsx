'use client';

export interface TrendSeries {
  name: string;
  /** One value per point along the x axis. Null leaves a gap rather than a point at zero. */
  values: readonly (number | null)[];
}

interface TrendChartProps {
  /** Read out for the picture. The list or table beside it carries the figures. */
  label: string;
  /** What each point along the x axis is, oldest first: a date, a record name. */
  points: readonly string[];
  /** One or two series. The second is drawn dashed, so the two are told apart without colour. */
  series: readonly TrendSeries[];
  formatValue: (value: number) => string;
}

const WIDTH = 360;
const HEIGHT = 170;
const LEFT = 48;
const RIGHT = 12;
const TOP = 12;
const BOTTOM = 34;

/** A round top and bottom for the scale, so the gridlines fall on plain numbers. */
function niceRange(low: number, high: number): [number, number] {
  if (!(high > low)) {
    const pad = Math.abs(high) > 0 ? Math.abs(high) * 0.1 : 1;
    return [low - pad, high + pad];
  }
  const power = 10 ** Math.floor(Math.log10(high - low));
  return [Math.floor(low / power) * power, Math.ceil(high / power) * power];
}

/**
 * Values over time, drawn without a chart library as one labelled image. A record that has no value
 * for a series breaks the line there instead of dropping to zero, because zero would be a result.
 */
export function TrendChart({ label, points, series, formatValue }: TrendChartProps) {
  const values = series.flatMap((line) => line.values.filter((value): value is number => value !== null));
  if (values.length === 0 || points.length === 0) return null;
  const [low, high] = niceRange(Math.min(...values), Math.max(...values));
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const x = (index: number) => LEFT + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => TOP + (1 - (value - low) / (high - low)) * plotHeight;
  const ticks = [low, (low + high) / 2, high];
  // At most six x labels, so they never run into one another on a phone.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <figure className="space-y-2">
      <svg role="img" aria-label={label} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full max-w-xl">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={LEFT}
              x2={WIDTH - RIGHT}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-outline-variant"
              strokeWidth={0.5}
            />
            <text
              x={LEFT - 6}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-on-surface-variant text-[11px] tabular-nums"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}
        {points.map((point, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <text
              key={`${point}-${index}`}
              x={x(index)}
              y={HEIGHT - 12}
              textAnchor="middle"
              className="fill-on-surface-variant text-[10px]"
            >
              {point}
            </text>
          ) : null,
        )}
        {series.map((line, seriesIndex) => {
          const segments: string[] = [];
          let current = '';
          line.values.forEach((value, index) => {
            if (value === null) {
              if (current) segments.push(current);
              current = '';
              return;
            }
            current += `${current ? ' L' : 'M'} ${x(index)} ${y(value)}`;
          });
          if (current) segments.push(current);
          const tone = seriesIndex === 0 ? 'primary' : 'tertiary';
          return (
            <g key={line.name}>
              {segments.map((segment) => (
                <path
                  key={segment}
                  d={segment}
                  fill="none"
                  className={tone === 'primary' ? 'stroke-primary' : 'stroke-tertiary'}
                  strokeWidth={1.5}
                  strokeDasharray={seriesIndex === 0 ? undefined : '4 3'}
                />
              ))}
              {line.values.map((value, index) =>
                value === null ? null : seriesIndex === 0 ? (
                  <circle key={index} cx={x(index)} cy={y(value)} r={3} className="fill-primary" />
                ) : (
                  <rect key={index} x={x(index) - 3} y={y(value) - 3} width={6} height={6} className="fill-tertiary" />
                ),
              )}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="flex flex-wrap gap-x-4 text-xs text-on-surface-variant">
          {series.map((line, index) => (
            <span key={line.name}>
              {index === 0 ? '● ' : '■ '}
              {line.name}
              {index === 0 ? '' : ' (- -)'}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

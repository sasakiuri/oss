'use client';

import { CHECK_LINE_MM, PAGE_MM, type PlacedGauge } from '@/lib/trace-gauge';
import type { Language } from '@/store';

const FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif";

/** One A4 page of gauges, drawn in millimetres so a print at 100 % keeps every size. */
export function GaugePage({
  gauges,
  language,
  actualSize = false,
  label,
  className,
}: {
  gauges: readonly PlacedGauge[];
  language: Language;
  actualSize?: boolean;
  label?: string;
  className?: string;
}) {
  const lineX = (PAGE_MM.width - CHECK_LINE_MM) / 2;
  const lineY = PAGE_MM.height - 14;
  return (
    <svg
      viewBox={`0 0 ${PAGE_MM.width} ${PAGE_MM.height}`}
      className={className}
      {...(actualSize
        ? { width: `${PAGE_MM.width}mm`, height: `${PAGE_MM.height}mm`, 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      <rect x={0} y={0} width={PAGE_MM.width} height={PAGE_MM.height} fill="#ffffff" />
      {gauges.map(({ gauge, x, y, widthMm, heightMm }) => {
        const size =
          gauge.kind === 'scat'
            ? gauge.lengthCm === null
              ? `φ${gauge.widthCm} cm`
              : `${gauge.widthCm}×${gauge.lengthCm} cm`
            : gauge.widthCm === null
              ? `${gauge.lengthCm} cm`
              : `${gauge.lengthCm}×${gauge.widthCm} cm`;
        return (
          <g key={gauge.id}>
            {gauge.kind === 'scat' && gauge.lengthCm === null ? (
              <circle
                cx={x + widthMm / 2}
                cy={y + heightMm / 2}
                r={widthMm / 2}
                fill="none"
                stroke="#000000"
                strokeWidth={0.4}
              />
            ) : (
              <rect
                x={x}
                y={y}
                width={widthMm}
                height={heightMm}
                rx={gauge.kind === 'scat' ? widthMm / 2 : 1}
                fill="none"
                stroke="#000000"
                strokeWidth={0.4}
                strokeDasharray={gauge.widthCm === null ? '1.5 1' : undefined}
              />
            )}
            <text
              x={x + widthMm / 2}
              y={y + heightMm + 4.5}
              fontFamily={FONT}
              fontSize={3.2}
              textAnchor="middle"
              fill="#000000"
            >
              {gauge.species[language]}
            </text>
            <text
              x={x + widthMm / 2}
              y={y + heightMm + 8.5}
              fontFamily={FONT}
              fontSize={2.8}
              textAnchor="middle"
              fill="#000000"
            >
              {gauge.part[language]} {size}
            </text>
          </g>
        );
      })}
      <path d={`M ${lineX} ${lineY} h ${CHECK_LINE_MM}`} fill="none" stroke="#000000" strokeWidth={0.25} />
      {Array.from({ length: 11 }, (_, index) => (
        <path
          key={index}
          d={`M ${lineX + index * 10} ${lineY - 2} v 4`}
          fill="none"
          stroke="#000000"
          strokeWidth={0.25}
        />
      ))}
      <text x={PAGE_MM.width / 2} y={lineY + 7} fontFamily={FONT} fontSize={3} textAnchor="middle" fill="#000000">
        {language === 'ja' ? '確認線 100 mm' : 'Check line 100 mm'}
      </text>
    </svg>
  );
}

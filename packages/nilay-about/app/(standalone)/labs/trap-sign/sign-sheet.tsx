'use client';

import type { layoutSign } from '@/lib/trap-sign';

const FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif";

/** The sign drawn in millimetres on its paper, lines centred and stacked from the top. */
export function SignSheet({
  layout,
  actualSize = false,
  label,
  className,
}: {
  layout: ReturnType<typeof layoutSign>;
  actualSize?: boolean;
  label?: string;
  className?: string;
}) {
  const { widthMm, heightMm, marginMm, lines } = layout;
  return (
    <svg
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      className={className}
      {...(actualSize
        ? { width: `${widthMm}mm`, height: `${heightMm}mm`, 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      <rect x={0} y={0} width={widthMm} height={heightMm} fill="#ffffff" />
      <rect
        x={marginMm / 2}
        y={marginMm / 2}
        width={widthMm - marginMm}
        height={heightMm - marginMm}
        fill="none"
        stroke="#c00000"
        strokeWidth={widthMm * 0.015}
      />
      {lines.map((line, index) => (
        <text
          key={`${index}-${line.text}`}
          x={widthMm / 2}
          y={line.baselineMm}
          fontFamily={FONT}
          fontSize={line.sizeMm}
          fontWeight={line.bold ? 700 : 400}
          textAnchor="middle"
          fill={index === 0 ? '#c00000' : '#000000'}
          {...(line.squeezeToMm === null ? {} : { textLength: line.squeezeToMm, lengthAdjust: 'spacingAndGlyphs' })}
        >
          {line.text}
        </text>
      ))}
    </svg>
  );
}

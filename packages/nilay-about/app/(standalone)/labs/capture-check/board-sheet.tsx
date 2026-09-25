'use client';

import type { boardLines } from '@/lib/capture-check';

const FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif";
const WIDTH_MM = 297;
const HEIGHT_MM = 210;
const MARGIN_MM = 15;
const LABEL_WIDTH_MM = 95;
const LABEL_SIZE_MM = 12;
const VALUE_SIZE_MM = 22;

interface BoardSheetProps {
  lines: ReturnType<typeof boardLines>;
  actualSize?: boolean;
  label?: string;
  className?: string;
}

/**
 * The board held up in the capture photo, on A4 landscape: the three lines of the manual's example,
 * large enough to read in a photo taken a few metres away. A blank value leaves a line to write on.
 */
export function BoardSheet({ lines, actualSize = false, label, className }: BoardSheetProps) {
  const rowHeight = (HEIGHT_MM - MARGIN_MM * 2) / lines.length;
  const valueWidth = WIDTH_MM - MARGIN_MM * 2 - LABEL_WIDTH_MM;
  return (
    <svg
      viewBox={`0 0 ${WIDTH_MM} ${HEIGHT_MM}`}
      className={className}
      {...(actualSize
        ? { width: `${WIDTH_MM}mm`, height: `${HEIGHT_MM}mm`, 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      <rect x={0} y={0} width={WIDTH_MM} height={HEIGHT_MM} fill="#ffffff" />
      <rect
        x={MARGIN_MM / 2}
        y={MARGIN_MM / 2}
        width={WIDTH_MM - MARGIN_MM}
        height={HEIGHT_MM - MARGIN_MM}
        fill="none"
        stroke="#000000"
        strokeWidth={1}
      />
      {lines.map((line, index) => {
        const top = MARGIN_MM + index * rowHeight;
        const baseline = top + rowHeight / 2;
        const characters = Array.from(line.value).length;
        // Squeezed into the row only when it would run past the edge.
        const squeeze = characters * VALUE_SIZE_MM > valueWidth;
        return (
          <g key={line.label}>
            {index > 0 && (
              <path
                d={`M ${MARGIN_MM / 2} ${top} h ${WIDTH_MM - MARGIN_MM}`}
                stroke="#000000"
                strokeWidth={0.5}
                fill="none"
              />
            )}
            <text
              x={MARGIN_MM}
              y={baseline}
              fontFamily={FONT}
              fontSize={LABEL_SIZE_MM}
              dominantBaseline="central"
              fill="#000000"
            >
              {line.label}
            </text>
            {line.value ? (
              <text
                x={MARGIN_MM + LABEL_WIDTH_MM}
                y={baseline}
                fontFamily={FONT}
                fontSize={VALUE_SIZE_MM}
                fontWeight={700}
                dominantBaseline="central"
                fill="#000000"
                {...(squeeze ? { textLength: valueWidth, lengthAdjust: 'spacingAndGlyphs' } : {})}
              >
                {line.value}
              </text>
            ) : (
              <path
                d={`M ${MARGIN_MM + LABEL_WIDTH_MM} ${baseline + VALUE_SIZE_MM / 2} h ${valueWidth}`}
                stroke="#000000"
                strokeWidth={0.4}
                strokeDasharray="2 2"
                fill="none"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

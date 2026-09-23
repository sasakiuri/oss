'use client';

import type { SnareGaugeLayout } from '@/lib/snare-gauge';

const SHEET_FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif";

export interface SnareGaugeSheetText {
  title: string;
  /** Along the line across the circle that stands for the longest inner line of the loop. */
  longAxis: string;
  /** Along the line at right angles to it, which is the one measured. */
  measured: string;
  strip: string;
  stripHow: string;
  slit: string;
  ruler: string;
  footer: string;
}

interface SnareGaugeSheetProps {
  layout: SnareGaugeLayout;
  text: SnareGaugeSheetText;
  label?: string;
  actualSize?: boolean;
  className?: string;
}

export function SnareGaugeSheet({ layout, text, label, actualSize = false, className }: SnareGaugeSheetProps) {
  const { page, circle, strip, slit, ruler, limitMm } = layout;
  const stroke = { fill: 'none', stroke: '#000000' } as const;
  return (
    <svg
      viewBox={`0 0 ${page.widthMm} ${page.heightMm}`}
      className={className}
      // Millimetres on the sheet itself, so a 100% print keeps the circle and the strip at the limit.
      {...(actualSize
        ? { width: `${page.widthMm}mm`, height: `${page.heightMm}mm`, 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      <rect x={0} y={0} width={page.widthMm} height={page.heightMm} fill="#ffffff" />
      <text x={page.widthMm / 2} y={12} fontFamily={SHEET_FONT} fontSize={5} textAnchor="middle" fill="#000000">
        {text.title}
      </text>

      {/* The circle is the limit across. The horizontal diameter stands for the longest inner line
          of the loop, and the vertical one for the line at right angles to it, which is measured. */}
      <circle cx={circle.cx} cy={circle.cy} r={circle.r} {...stroke} strokeWidth={0.3} />
      <path
        d={`M ${circle.cx - circle.r} ${circle.cy} h ${circle.r * 2}`}
        {...stroke}
        strokeWidth={0.25}
        strokeDasharray="2 1.5"
      />
      <path d={`M ${circle.cx} ${circle.cy - circle.r} v ${circle.r * 2}`} {...stroke} strokeWidth={0.5} />
      <text
        x={circle.cx - circle.r / 2}
        y={circle.cy - 2}
        fontFamily={SHEET_FONT}
        fontSize={3}
        textAnchor="middle"
        fill="#000000"
      >
        {text.longAxis}
      </text>
      <text x={circle.cx + 2} y={circle.cy + circle.r / 2} fontFamily={SHEET_FONT} fontSize={3} fill="#000000">
        {text.measured}
      </text>

      {/* The no-go strip is exactly the limit long, with a tick every 10 mm. */}
      <rect x={strip.x} y={strip.y} width={strip.lengthMm} height={strip.heightMm} {...stroke} strokeWidth={0.3} />
      {Array.from({ length: Math.floor(limitMm / 10) + 1 }, (_, index) => (
        <path
          key={index}
          d={`M ${strip.x + index * 10} ${strip.y + strip.heightMm} v -2.5`}
          {...stroke}
          strokeWidth={0.2}
        />
      ))}
      <text
        x={page.widthMm / 2}
        y={strip.y + 4.5}
        fontFamily={SHEET_FONT}
        fontSize={3}
        textAnchor="middle"
        fill="#000000"
      >
        {text.strip}
      </text>
      <text
        x={page.widthMm / 2}
        y={strip.y + strip.heightMm + 4.5}
        fontFamily={SHEET_FONT}
        fontSize={2.8}
        textAnchor="middle"
        fill="#000000"
      >
        {text.stripHow}
      </text>

      {/* The 100 mm line for checking the scale of the print. */}
      <path d={`M ${ruler.x} ${ruler.y} h ${ruler.lengthMm}`} {...stroke} strokeWidth={0.25} />
      {Array.from({ length: ruler.lengthMm / 10 + 1 }, (_, index) => (
        <path key={index} d={`M ${ruler.x + index * 10} ${ruler.y - 2} v 4`} {...stroke} strokeWidth={0.25} />
      ))}
      <text x={ruler.x} y={ruler.y + 7} fontFamily={SHEET_FONT} fontSize={3} fill="#000000">
        {text.ruler}
      </text>

      {/* A 4 mm slit, for reference only: no official way of measuring the wire is published. */}
      <rect x={slit.x} y={slit.y} width={slit.widthMm} height={slit.heightMm} {...stroke} strokeWidth={0.2} />
      <text
        x={slit.x + slit.widthMm + 2}
        y={slit.y + slit.heightMm / 2}
        fontFamily={SHEET_FONT}
        fontSize={3}
        fill="#000000"
      >
        {text.slit}
      </text>

      <text
        x={page.widthMm / 2}
        y={page.heightMm - 5}
        fontFamily={SHEET_FONT}
        fontSize={2.8}
        textAnchor="middle"
        fill="#000000"
      >
        {text.footer}
      </text>
    </svg>
  );
}

'use client';

import {
  CONTENT_BOTTOM_MM,
  OVERLAP_MM,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  REFERENCE_LINE_MM,
  paperY,
  tallTargetTicks,
  type TallTargetLayout,
  type TallTargetPage,
} from '@/lib/click-verification';

// The same gothic stack as the other printed sheets.
const SHEET_FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif";
const LINE_X = PAGE_WIDTH_MM / 2;
const AIM_SIZE_MM = 30;
const REFERENCE_X = 20;
const REFERENCE_Y = 278;

export interface TallTargetSheetText {
  /** "Join line 2" and similar, for the line a sheet shares with the next. */
  join: (number: number) => string;
  expected: string;
  aim: string;
  glue: string;
  page: (index: number, count: number) => string;
  reference: string;
}

interface TallTargetSheetProps {
  layout: TallTargetLayout;
  page: TallTargetPage;
  text: TallTargetSheetText;
  label?: string;
  actualSize?: boolean;
  className?: string;
}

/**
 * One A4 sheet of the tall target, drawn in millimetres so a 100% print is actual size.
 * The 50 mm reference line at the foot shows whether the printer scaled the page.
 */
export function TallTargetSheet({ layout, page, text, label, actualSize = false, className }: TallTargetSheetProps) {
  const y = (heightMm: number) => paperY(page, heightMm);
  const ticks = tallTargetTicks(page);
  const showsAim = page.startMm <= 0;
  const showsExpected = layout.expectedMm >= page.startMm && layout.expectedMm <= page.endMm;
  const joinLine = (heightMm: number, number: number) => (
    <g key={`join-${heightMm}`}>
      <path
        d={`M 10 ${y(heightMm)} H ${PAGE_WIDTH_MM - 10}`}
        fill="none"
        stroke="#000000"
        strokeWidth={0.3}
        strokeDasharray="3 2"
      />
      <text x={12} y={y(heightMm) - 1.5} fontFamily={SHEET_FONT} fontSize={3} fill="#000000">
        {text.join(number)}
      </text>
    </g>
  );

  return (
    <svg
      viewBox={`0 0 ${PAGE_WIDTH_MM} ${PAGE_HEIGHT_MM}`}
      className={className}
      {...(actualSize
        ? { width: `${PAGE_WIDTH_MM}mm`, height: `${PAGE_HEIGHT_MM}mm`, 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      <rect x={0} y={0} width={PAGE_WIDTH_MM} height={PAGE_HEIGHT_MM} fill="#ffffff" />
      {page.joinBelowMm !== null && (
        <>
          {/* The gluing strip: the sheet below is laid over it, trimmed at its own join line. */}
          <rect x={10} y={y(page.joinBelowMm)} width={PAGE_WIDTH_MM - 20} height={OVERLAP_MM} fill="#e6e6e6" />
          <text
            x={PAGE_WIDTH_MM - 12}
            y={y(page.joinBelowMm) + OVERLAP_MM / 2}
            fontFamily={SHEET_FONT}
            fontSize={3}
            textAnchor="end"
            dominantBaseline="central"
            fill="#000000"
          >
            {text.glue}
          </text>
        </>
      )}
      <path d={`M ${LINE_X} ${y(page.startMm)} V ${y(page.endMm)}`} fill="none" stroke="#000000" strokeWidth={1} />
      {ticks.map((tick) => (
        <g key={tick.heightMm}>
          <path
            d={`M ${LINE_X} ${y(tick.heightMm)} h ${tick.lengthMm}`}
            fill="none"
            stroke="#000000"
            strokeWidth={tick.labelled ? 0.25 : 0.15}
          />
          {tick.labelled && (
            <text
              x={LINE_X + tick.lengthMm + 1.5}
              y={y(tick.heightMm)}
              fontFamily={SHEET_FONT}
              fontSize={2.8}
              dominantBaseline="central"
              fill="#000000"
            >
              {tick.heightMm}
            </text>
          )}
        </g>
      ))}
      {showsAim && (
        <g>
          <rect
            x={LINE_X - AIM_SIZE_MM / 2}
            y={y(0) - AIM_SIZE_MM / 2}
            width={AIM_SIZE_MM}
            height={AIM_SIZE_MM}
            fill="none"
            stroke="#000000"
            strokeWidth={2}
          />
          <path d={`M ${LINE_X - 40} ${y(0)} H ${LINE_X + 40}`} fill="none" stroke="#000000" strokeWidth={0.3} />
          <text
            x={LINE_X - AIM_SIZE_MM / 2 - 3}
            y={y(0) - AIM_SIZE_MM / 2 - 2}
            fontFamily={SHEET_FONT}
            fontSize={3.5}
            textAnchor="end"
            fill="#000000"
          >
            {text.aim}
          </text>
        </g>
      )}
      {showsExpected && (
        <g>
          <path
            d={`M ${LINE_X - 60} ${y(layout.expectedMm)} H ${LINE_X}`}
            fill="none"
            stroke="#000000"
            strokeWidth={0.4}
            strokeDasharray="4 2"
          />
          <text x={LINE_X - 60} y={y(layout.expectedMm) - 2} fontFamily={SHEET_FONT} fontSize={3.5} fill="#000000">
            {text.expected}
          </text>
        </g>
      )}
      {page.joinBelowMm !== null && joinLine(page.joinBelowMm, page.index)}
      {page.joinAboveMm !== null && joinLine(page.joinAboveMm, page.index + 1)}
      <path
        d={`M ${REFERENCE_X} ${REFERENCE_Y} h ${REFERENCE_LINE_MM}`}
        fill="none"
        stroke="#000000"
        strokeWidth={0.25}
      />
      {Array.from({ length: REFERENCE_LINE_MM / 10 + 1 }, (_, index) => (
        <path
          key={index}
          d={`M ${REFERENCE_X + index * 10} ${REFERENCE_Y - 2} v 4`}
          fill="none"
          stroke="#000000"
          strokeWidth={0.25}
        />
      ))}
      <text
        x={REFERENCE_X + REFERENCE_LINE_MM + 4}
        y={REFERENCE_Y}
        fontFamily={SHEET_FONT}
        fontSize={3}
        dominantBaseline="central"
        fill="#000000"
      >
        {text.reference}
      </text>
      <text
        x={PAGE_WIDTH_MM - REFERENCE_X}
        y={CONTENT_BOTTOM_MM + 20}
        fontFamily={SHEET_FONT}
        fontSize={3.5}
        textAnchor="end"
        fill="#000000"
      >
        {text.page(page.index, layout.pageCount)}
      </text>
    </svg>
  );
}

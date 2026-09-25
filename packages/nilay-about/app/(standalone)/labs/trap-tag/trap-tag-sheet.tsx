'use client';

import type { TrapTagLayout } from '@/lib/trap-tag';

// A gothic stack keeps the strokes of the required items legible at 10 mm.
const TAG_FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif";

interface TrapTagSheetProps {
  layout: TrapTagLayout;
  /** Printed under the reference line, in the language of the interface. */
  note: string;
  label?: string;
  actualSize?: boolean;
  className?: string;
}

export function TrapTagSheet({ layout, note, label, actualSize = false, className }: TrapTagSheetProps) {
  const { page, tag, positions, lines, charSizeMm, lineHeightMm, paddingMm, ruler } = layout;
  return (
    <svg
      viewBox={`0 0 ${page.widthMm} ${page.heightMm}`}
      className={className}
      // Millimetres on the sheet itself, so a 100% print keeps every character at
      // the size the person selected.
      {...(actualSize
        ? { width: `${page.widthMm}mm`, height: `${page.heightMm}mm`, 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      <rect x={0} y={0} width={page.widthMm} height={page.heightMm} fill="#ffffff" />
      {positions.map((position, index) => (
        <g key={index}>
          <rect
            x={position.x}
            y={position.y}
            width={tag.widthMm}
            height={tag.heightMm}
            fill="none"
            stroke="#000000"
            strokeWidth={0.3}
          />
          {lines.map((line, row) =>
            layout.blankLines.includes(row)
              ? // An item left to write by hand: one box per character, at the size chosen.
                Array.from(line).map((_, column) => (
                  <rect
                    key={`${row}-${column}`}
                    x={position.x + paddingMm + column * charSizeMm}
                    y={position.y + paddingMm + (row + 0.5) * lineHeightMm - charSizeMm / 2}
                    width={charSizeMm}
                    height={charSizeMm}
                    fill="none"
                    stroke="#000000"
                    strokeWidth={0.15}
                  />
                ))
              : // One character per cell so the printed width matches the calculation.
                // textLength stretches half-width digits and letters, whose advance is
                // about half an em, up to the selected size instead of rewriting the
                // required items into full-width characters.
                Array.from(line).map((character, column) => (
                  <text
                    key={`${row}-${column}`}
                    x={position.x + paddingMm + (column + 0.5) * charSizeMm}
                    y={position.y + paddingMm + (row + 0.5) * lineHeightMm}
                    fontFamily={TAG_FONT}
                    fontSize={charSizeMm}
                    textLength={charSizeMm}
                    lengthAdjust="spacingAndGlyphs"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#000000"
                  >
                    {character}
                  </text>
                )),
          )}
        </g>
      ))}
      <path d={`M ${ruler.x} ${ruler.y} h ${ruler.lengthMm}`} fill="none" stroke="#000000" strokeWidth={0.25} />
      {Array.from({ length: 6 }, (_, index) => (
        <path
          key={index}
          d={`M ${ruler.x + index * 10} ${ruler.y - 2} v 4`}
          fill="none"
          stroke="#000000"
          strokeWidth={0.25}
        />
      ))}
      <text
        x={page.widthMm / 2}
        y={ruler.y + 8}
        fontFamily={TAG_FONT}
        fontSize={3.5}
        textAnchor="middle"
        fill="#000000"
      >
        {note}
      </text>
    </svg>
  );
}

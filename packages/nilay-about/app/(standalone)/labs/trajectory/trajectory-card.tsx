'use client';

import type { TrajectoryCardContent, TrajectoryCardLayout } from '@/lib/trajectory-card';

// A gothic stack, for the same reason the trap tag uses one: the headings and the
// conditions are Japanese, and the digits beside them have to share their weight.
const CARD_FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif";

interface TrajectoryCardSheetProps {
  layout: TrajectoryCardLayout;
  content: TrajectoryCardContent;
  /** Printed under the reference line, in the language of the interface. */
  note: string;
  label?: string;
  actualSize?: boolean;
  className?: string;
}

/**
 * The A4 sheet of cards.
 *
 * Millimetres throughout, so a print at 100% puts a 91 mm card on 91 mm of paper. The card
 * is drawn with a cutting border, the conditions are pinned to its foot, and the reference
 * line at the bottom of the sheet is what tells the reader whether the printer scaled it.
 */
export function TrajectoryCardSheet({
  layout,
  content,
  note,
  label,
  actualSize = false,
  className,
}: TrajectoryCardSheetProps) {
  const { page, card, positions, paddingMm, cellPaddingMm, title, head, body, condition, columnOffsetsMm, ruler } =
    layout;
  const tableLeftMm = columnOffsetsMm[0] ?? paddingMm;
  const tableRightMm = columnOffsetsMm[columnOffsetsMm.length - 1] ?? card.widthMm - paddingMm;

  return (
    <svg
      viewBox={`0 0 ${page.widthMm} ${page.heightMm}`}
      className={className}
      // Millimetres on the sheet itself, so a 100% print keeps every card at the size
      // that was selected.
      {...(actualSize
        ? { width: `${page.widthMm}mm`, height: `${page.heightMm}mm`, 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      <rect x={0} y={0} width={page.widthMm} height={page.heightMm} fill="#ffffff" />
      {positions.map((position, index) => {
        const headTop = position.y + paddingMm + (title?.lineMm ?? 0);
        const bodyTop = headTop + head.heightMm;
        const conditionsTop = position.y + card.heightMm - paddingMm - content.conditions.length * condition.lineMm;
        return (
          <g key={index}>
            <rect
              x={position.x}
              y={position.y}
              width={card.widthMm}
              height={card.heightMm}
              fill="none"
              stroke="#000000"
              strokeWidth={0.3}
            />
            {title && (
              <text
                x={position.x + paddingMm}
                y={position.y + paddingMm + title.lineMm / 2}
                fontFamily={CARD_FONT}
                fontSize={title.fontMm}
                fontWeight="bold"
                dominantBaseline="central"
                fill="#000000"
              >
                {content.title}
              </text>
            )}
            {content.headers.map((header, column) => {
              const start = (columnOffsetsMm[column] ?? 0) + position.x;
              const end = (columnOffsetsMm[column + 1] ?? 0) + position.x;
              return (
                <text
                  key={`head-${column}`}
                  x={column === 0 ? start + cellPaddingMm : end - cellPaddingMm}
                  y={headTop + head.heightMm / 2}
                  fontFamily={CARD_FONT}
                  fontSize={head.fontMm}
                  textAnchor={column === 0 ? 'start' : 'end'}
                  dominantBaseline="central"
                  fill="#000000"
                >
                  {header}
                </text>
              );
            })}
            {/* Under the heading and again under the last row: the two rules a table is read by. */}
            <path
              d={`M ${position.x + tableLeftMm} ${bodyTop} H ${position.x + tableRightMm}`}
              fill="none"
              stroke="#000000"
              strokeWidth={0.25}
            />
            {content.rows.map((row, rowIndex) =>
              row.map((value, column) => {
                const start = (columnOffsetsMm[column] ?? 0) + position.x;
                const end = (columnOffsetsMm[column + 1] ?? 0) + position.x;
                return (
                  <text
                    key={`cell-${rowIndex}-${column}`}
                    x={column === 0 ? start + cellPaddingMm : end - cellPaddingMm}
                    y={bodyTop + (rowIndex + 0.5) * body.rowHeightMm}
                    fontFamily={CARD_FONT}
                    fontSize={body.fontMm}
                    textAnchor={column === 0 ? 'start' : 'end'}
                    dominantBaseline="central"
                    fill="#000000"
                  >
                    {value}
                  </text>
                );
              }),
            )}
            <path
              d={`M ${position.x + tableLeftMm} ${bodyTop + content.rows.length * body.rowHeightMm} H ${position.x + tableRightMm}`}
              fill="none"
              stroke="#000000"
              strokeWidth={0.25}
            />
            {content.conditions.map((line, lineIndex) => (
              <text
                key={`condition-${lineIndex}`}
                x={position.x + paddingMm}
                y={conditionsTop + (lineIndex + 0.5) * condition.lineMm}
                fontFamily={CARD_FONT}
                fontSize={condition.fontMm}
                dominantBaseline="central"
                fill="#000000"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
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
        fontFamily={CARD_FONT}
        fontSize={3.5}
        textAnchor="middle"
        fill="#000000"
      >
        {note}
      </text>
    </svg>
  );
}

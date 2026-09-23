'use client';

import { Fragment } from 'react';

import { SKEET_SEQUENCE, TARGETS_PER_ROUND, type ClayDiscipline } from '@/lib/clay-score';
import type { Language } from '@/store';

const FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif";
const PAGE = { width: 210, height: 297 };
const MARGIN = 12;
const BLOCK = { width: 87, height: 76, gap: 12, top: 46 };
const LABEL_WIDTH = 17;
const CELL_WIDTH = 12;
const TOTAL_WIDTH = 10;
const TRAP_ROW = 9;
const SKEET_ROW = 6.4;
const ROUNDS = 5;

interface ClayScoreSheetProps {
  discipline: ClayDiscipline;
  language: Language;
  /** Screen preview: scaled to its box and described for a screen reader. */
  label?: string;
  /** Paper: millimetres on the sheet itself. */
  actualSize?: boolean;
  className?: string;
}

const line = { fill: 'none', stroke: '#000000', strokeWidth: 0.3 } as const;

function Text({
  x,
  y,
  size,
  anchor = 'start',
  children,
}: {
  x: number;
  y: number;
  size: number;
  anchor?: 'start' | 'middle' | 'end';
  children: string;
}) {
  return (
    <text x={x} y={y} fontFamily={FONT} fontSize={size} textAnchor={anchor} dominantBaseline="central" fill="#000000">
      {children}
    </text>
  );
}

/** A blank sheet for five rounds of one discipline, drawn in millimetres on A4. */
export function ClayScoreSheet({ discipline, language, label, actualSize = false, className }: ClayScoreSheetProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const blockOrigin = (slot: number) => ({
    x: MARGIN + (slot % 2) * (BLOCK.width + BLOCK.gap),
    y: BLOCK.top + Math.floor(slot / 2) * BLOCK.height,
  });

  const heading = (x: number, y: number, round: number) => (
    <>
      <Text x={x} y={y + 3} size={4}>
        {t(`ラウンド ${round}`, `Round ${round}`)}
      </Text>
      <Text x={x + BLOCK.width} y={y + 3} size={3.5} anchor="end">
        {t(`計 ＿＿＿ / ${TARGETS_PER_ROUND}`, `Total ____ / ${TARGETS_PER_ROUND}`)}
      </Text>
    </>
  );

  // Trap: a row for each pass along the line, a column for each place in it. The athlete writes the
  // station numbers in the top row once, because the starting station differs by squad position.
  const trapBlock = (x: number, y: number) => {
    const gridX = x + LABEL_WIDTH;
    const gridY = y + 8;
    const header = 6;
    const rows = 5;
    const cells = [];
    for (let column = 0; column < 5; column++) {
      const cx = gridX + column * CELL_WIDTH;
      cells.push(<rect key={`h${column}`} x={cx} y={gridY} width={CELL_WIDTH} height={header} {...line} />);
      for (let row = 0; row < rows; row++)
        cells.push(
          <rect
            key={`${row}-${column}`}
            x={cx}
            y={gridY + header + row * TRAP_ROW}
            width={CELL_WIDTH}
            height={TRAP_ROW}
            {...line}
          />,
        );
      cells.push(
        <rect
          key={`f${column}`}
          x={cx}
          y={gridY + header + rows * TRAP_ROW}
          width={CELL_WIDTH}
          height={header}
          {...line}
        />,
      );
    }
    for (let row = 0; row < rows; row++)
      cells.push(
        <Fragment key={`l${row}`}>
          <Text x={x} y={gridY + header + (row + 0.5) * TRAP_ROW} size={3}>
            {t(`${row + 1} 巡目`, `Pass ${row + 1}`)}
          </Text>
          <rect
            x={gridX + 5 * CELL_WIDTH}
            y={gridY + header + row * TRAP_ROW}
            width={TOTAL_WIDTH}
            height={TRAP_ROW}
            {...line}
          />
        </Fragment>,
      );
    return (
      <>
        <Text x={x} y={gridY + header / 2} size={3}>
          {t('射台', 'Station')}
        </Text>
        <Text x={x} y={gridY + header + rows * TRAP_ROW + header / 2} size={3}>
          {t('射台計', 'Total')}
        </Text>
        <Text x={gridX + 5 * CELL_WIDTH + TOTAL_WIDTH / 2} y={gridY + header / 2} size={3} anchor="middle">
          {t('計', 'Sum')}
        </Text>
        {cells}
      </>
    );
  };

  // Skeet: one row for each stop in the qualification sequence, each box marked with what is thrown.
  const skeetBlock = (x: number, y: number) => {
    const gridX = x + LABEL_WIDTH;
    const gridY = y + 8;
    return SKEET_SEQUENCE.map(({ station, shots }, row) => {
      const rowY = gridY + row * SKEET_ROW;
      return (
        <Fragment key={row}>
          <Text x={x} y={rowY + SKEET_ROW / 2} size={3}>
            {t(`射台 ${station}`, `Station ${station}`)}
          </Text>
          {shots.map(([kind, house], column) => (
            <Fragment key={column}>
              <rect x={gridX + column * CELL_WIDTH} y={rowY} width={CELL_WIDTH} height={SKEET_ROW} {...line} />
              <text
                x={gridX + column * CELL_WIDTH + 0.8}
                y={rowY + 1.6}
                fontFamily={FONT}
                fontSize={2}
                dominantBaseline="central"
                fill="#000000"
              >
                {`${kind === 'single' ? 'S' : 'D'}·${house === 'high' ? 'H' : 'L'}`}
              </text>
            </Fragment>
          ))}
          <rect x={gridX + 4 * CELL_WIDTH} y={rowY} width={TOTAL_WIDTH} height={SKEET_ROW} {...line} />
        </Fragment>
      );
    });
  };

  const total = blockOrigin(ROUNDS);
  return (
    <svg
      viewBox={`0 0 ${PAGE.width} ${PAGE.height}`}
      className={className}
      {...(actualSize
        ? { width: `${PAGE.width}mm`, height: `${PAGE.height}mm`, 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      <rect x={0} y={0} width={PAGE.width} height={PAGE.height} fill="#ffffff" />
      <Text x={MARGIN} y={MARGIN + 4} size={6}>
        {discipline === 'trap'
          ? t('クレー射撃スコアシート（トラップ）', 'Clay score sheet (Trap)')
          : t('クレー射撃スコアシート（スキート）', 'Clay score sheet (Skeet)')}
      </Text>
      <Text x={MARGIN} y={MARGIN + 15} size={3.8}>
        {t(
          '氏名 ＿＿＿＿＿＿＿＿＿＿　日付 ＿＿＿＿＿＿＿＿　射撃場 ＿＿＿＿＿＿＿＿＿＿',
          'Name ______________   Date ____________   Range ______________',
        )}
      </Text>
      {(discipline === 'trap'
        ? [
            t('各マスに命中は ○、失中は × を記入します。', 'Mark each box ○ for a hit and × for a miss.'),
            t(
              '上の段に自分の射台番号を記入します（開始射台から右へ回ります）。',
              'Write your station numbers in the top row, from your first station moving right.',
            ),
          ]
        : [
            t('各マスに命中は ○、失中は × を記入します。', 'Mark each box ○ for a hit and × for a miss.'),
            t(
              'S = シングル、D = ダブル、H = ハイハウス、L = ローハウス。',
              'S = single, D = double, H = high house, L = low house.',
            ),
          ]
      ).map((text, row) => (
        <Text key={row} x={MARGIN} y={MARGIN + 23 + row * 5} size={3.2}>
          {text}
        </Text>
      ))}
      {Array.from({ length: ROUNDS }, (_, round) => {
        const { x, y } = blockOrigin(round);
        return (
          <g key={round}>
            {heading(x, y, round + 1)}
            {discipline === 'trap' ? trapBlock(x, y) : skeetBlock(x, y)}
          </g>
        );
      })}
      <rect x={total.x} y={total.y + 8} width={BLOCK.width} height={24} {...line} />
      <Text x={total.x + 4} y={total.y + 20} size={4.5}>
        {t(`合計 ＿＿＿＿ / ${ROUNDS * TARGETS_PER_ROUND}`, `Total ______ / ${ROUNDS * TARGETS_PER_ROUND}`)}
      </Text>
      {[
        t(
          '1 ラウンド 25 枚の構成は ISSF 規則（2026 年版）によります。',
          '25 targets per round, per the ISSF Rules (2026 edition).',
        ),
        t(
          '個人の練習記録用です。審判による公式記録の代わりにはなりません。',
          'For personal practice records. Not a substitute for the official scorecard kept by the referees.',
        ),
      ].map((text, row) => (
        <Text key={row} x={MARGIN} y={PAGE.height - MARGIN - 8 + row * 4.5} size={2.8}>
          {text}
        </Text>
      ))}
    </svg>
  );
}

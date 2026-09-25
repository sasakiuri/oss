/**
 * A "traps set" warning sign to post near traps. No national rule sets its wording or size; where
 * a prefecture makes one a condition (Wakayama, for snares over 12 cm), its plan does not either.
 */

export const TRAP_SIGN_SOURCES_CHECKED_ON = '2026-09-24';

export const TRAP_SIGN_SOURCES = {
  wakayama: {
    label: '和歌山県「狩猟の規制・ルール」',
    url: 'https://www.pref.wakayama.lg.jp/prefg/072000/d00216578.html',
    quote:
      '※ただし、和歌山県では、ツキノワグマ生息地を除く地区に限り、イノシシ及びニホンジカを捕獲するために、注意看板を設置すれば、輪の直径が12cmを超えるくくりわなの使用を可とします。',
  },
  hyogo: {
    label: '兵庫県 記者発表（2025年11月12日）',
    url: 'https://web.pref.hyogo.lg.jp/nk20/press/20251112.html',
    quote:
      '地面に仕掛けられたワイヤーロープの「くくりわな」は、非常に危険ですので、わな設置の看板(標識)がある付近へは近づかないようにしましょう。',
  },
} as const;

export const SIGN_HEADLINES = ['trap', 'snare', 'box'] as const;
export type SignHeadline = (typeof SIGN_HEADLINES)[number];

export const HEADLINE_TEXT: Record<SignHeadline, { ja: string; en: string }> = {
  trap: { ja: 'わな設置中', en: 'TRAPS SET' },
  snare: { ja: 'くくりわな設置中', en: 'SNARES SET' },
  box: { ja: '箱わな設置中', en: 'BOX TRAPS SET' },
};

export const SIGN_PAPERS = {
  a4: { widthMm: 210, heightMm: 297 },
  a3: { widthMm: 297, heightMm: 420 },
} as const;
export type SignPaper = keyof typeof SIGN_PAPERS;

export const SIGN_FIELD_MAX_LENGTH = 40;

export interface SignFields {
  headline: SignHeadline;
  /** What is being caught, e.g. イノシシ・ニホンジカ. */
  target: string;
  period: string;
  setter: string;
  contact: string;
  english: boolean;
}

export interface SignLine {
  text: string;
  /** Height of the line's characters as a share of the paper width. */
  size: number;
  bold?: boolean;
  lang: 'ja' | 'en';
}

/**
 * The lines of the sign, top to bottom. The warning and the request to keep away always come first;
 * the optional details follow only when given.
 */
export function signLines(fields: SignFields): SignLine[] {
  const lines: SignLine[] = [
    { text: '危険', size: 0.16, bold: true, lang: 'ja' },
    { text: HEADLINE_TEXT[fields.headline].ja, size: 0.11, bold: true, lang: 'ja' },
    { text: 'わなに近づかないでください', size: 0.055, lang: 'ja' },
  ];
  if (fields.english)
    lines.push(
      { text: `DANGER - ${HEADLINE_TEXT[fields.headline].en}`, size: 0.05, bold: true, lang: 'en' },
      { text: 'Keep away from the traps.', size: 0.04, lang: 'en' },
    );
  const detail = (label: string, value: string) => (value.trim() ? [`${label}：${value.trim()}`] : []);
  for (const text of [
    ...detail('対象', fields.target),
    ...detail('期間', fields.period),
    ...detail('設置者', fields.setter),
    ...detail('連絡先', fields.contact),
  ])
    lines.push({ text, size: 0.042, lang: 'ja' });
  return lines;
}

export interface PlacedSignLine extends SignLine {
  sizeMm: number;
  baselineMm: number;
  /** Set when the line would run past the margins, to squeeze it to this width. */
  squeezeToMm: number | null;
}

/** Stacks the lines from the top of the paper, each at its share of the paper width. */
export function layoutSign(lines: readonly SignLine[], paper: SignPaper) {
  const { widthMm, heightMm } = SIGN_PAPERS[paper];
  const marginMm = widthMm * 0.07;
  const usable = widthMm - marginMm * 2;
  let y = marginMm * 1.4;
  const placed: PlacedSignLine[] = lines.map((line) => {
    const sizeMm = line.size * widthMm;
    const baselineMm = y + sizeMm;
    y = baselineMm + sizeMm * 0.55;
    // A full-width character is about one em wide, a Latin one about half.
    const estimated = Array.from(line.text).length * sizeMm * (line.lang === 'ja' ? 1 : 0.6);
    return { ...line, sizeMm, baselineMm, squeezeToMm: estimated > usable ? usable : null };
  });
  return { widthMm, heightMm, marginMm, lines: placed, fits: y <= heightMm - marginMm };
}

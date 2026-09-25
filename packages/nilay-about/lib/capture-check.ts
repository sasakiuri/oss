/**
 * Capture confirmation for the capture payments of the national wildlife damage grant: the photos
 * the Ministry of Agriculture's manual asks for, the board held up in them, reading the date and
 * position a camera wrote into a photo, and the payment per head.
 */

type Text = { ja: string; en: string };

export const CAPTURE_SOURCES_CHECKED_ON = '2026-09-24';

export const CAPTURE_SOURCES = {
  manual: {
    title: '捕獲確認マニュアル（令和7年4月1日付 6農振第2971号）',
    publisher: '農林水産省',
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/yosan/attach/pdf/yosan-180.pdf',
  },
  guideline: {
    title: '鳥獣被害防止総合対策交付金実施要領（令和8年4月7日一部改正）別記4 第3',
    publisher: '農林水産省',
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/yosan/attach/pdf/yosan-211.pdf',
  },
} as const;
export type CaptureSourceId = keyof typeof CAPTURE_SOURCES;

// ---------------------------------------------------------------------------------------------------
// The photos
// ---------------------------------------------------------------------------------------------------

export interface ShotItem {
  id: string;
  text: Text;
  quote: string;
  where: string;
  /** Needed only when one person made the capture alone. */
  soloOnly?: boolean;
}

/** What the manual asks the photos to show when the capture is confirmed from documents (p.6–7). */
export const SHOT_ITEMS: readonly ShotItem[] = [
  {
    id: 'marking',
    text: {
      ja: '個体にスプレー等（油性）でマーキングした（内容は事業実施主体の指定どおり）',
      en: 'Marked the animal with (oil-based) spray, with the content the programme specifies',
    },
    quote:
      '捕獲従事者は、捕獲個体にスプレー等（油性）でマーキングする。マーキングする内容は捕獲日や捕獲頭数等、捕獲個体の識別が可能となるよう事業実施主体で統一する。',
    where: 'p.6',
  },
  {
    id: 'orientation',
    text: {
      ja: '撮影者から見て足が下、頭が右（右の横腹が写る向き）で撮った',
      en: 'Shot with the feet down and the head to the right as seen by the photographer (right flank showing)',
    },
    quote:
      '原則として、撮影者から見て捕獲個体の足が下向きになり、その際、頭部が右側（右横腹が写るように）にくる状態とする。',
    where: 'p.6',
  },
  {
    id: 'contents',
    text: {
      ja: '捕獲従事者・個体・捕獲日・マーキングの内容が 1 枚で確認できる',
      en: 'The hunter, the animal, the capture date and the marking can all be seen',
    },
    quote:
      '証拠写真は、捕獲従事者、捕獲個体、捕獲日及びマーキング内容が確認できるよう撮影し、撮影方法は事業実施主体で統一する。',
    where: 'p.6',
  },
  {
    id: 'permit',
    text: {
      ja: '1 人で捕獲した場合は、許可証か従事者証を添えた',
      en: 'Captured alone: the permit or the hunter’s certificate is included',
    },
    quote: '１名で捕獲した場合は、許可証又は従事者証を添える',
    where: 'p.7（写真のイメージ）',
    soloOnly: true,
  },
  {
    id: 'prevention',
    text: {
      ja: '不正防止の追加の写真を 1 つ以上撮った（尾の切断後、マーキングへの横線、識別番号と指定文字、埋設中・角度を変えた写真のいずれか。事業実施主体の指定に従う）',
      en: 'Took at least one extra anti-fraud photo (after cutting the tail, a line over the marking, the ID and the designated characters, or burial / a different angle), as the programme specifies',
    },
    quote: '以下に示す実効性の高い手法のうちいずれかの方法又はこれと同等以上の取組を１つ以上行うものとする。',
    where: 'p.6–7',
  },
  {
    id: 'evidence',
    text: {
      ja: '証拠物（獣類は原則として尾、鳥類は両脚）を確保した',
      en: 'Kept the evidence (as a rule the tail for mammals, both legs for birds)',
    },
    quote: 'a.獣類にあっては、原則として「尾」とする。…b.鳥類にあっては、原則として「両脚」とする。',
    where: 'p.7',
  },
];

// ---------------------------------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------------------------------

/** The three lines of the manual's example board: capture date, hunter's name, individual number. */
export interface BoardFields {
  date: string;
  hunter: string;
  individual: string;
}

export const BOARD_FIELD_MAX_LENGTH = 30;

export type BoardField = keyof BoardFields;
export const BOARD_FIELDS: readonly BoardField[] = ['date', 'hunter', 'individual'];

export const BOARD_LABELS: Record<BoardField, string> = {
  date: '捕獲日',
  hunter: '捕獲従事者氏名',
  individual: '個体番号',
};

/** The lines printed on the board and drawn on a photo, in the manual's order. Empty lines are kept blank to fill by hand. */
export function boardLines(fields: BoardFields): { label: string; value: string }[] {
  return BOARD_FIELDS.map((field) => ({ label: BOARD_LABELS[field], value: fields[field].trim() }));
}

/** 2026-09-24 → 令和8年9月24日. Only dates in Reiwa are written this way. */
export function reiwaDate(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  if (year < 2019 || (year === 2019 && month < 5)) return null;
  const era = year - 2018;
  return `令和${era === 1 ? '元' : era}年${month}月${day}日`;
}

// ---------------------------------------------------------------------------------------------------
// What the camera wrote into the photo
// ---------------------------------------------------------------------------------------------------

export interface PhotoMetadata {
  /** DateTimeOriginal as written, "YYYY:MM:DD HH:MM:SS", or null. */
  takenAt: string | null;
  latitude: number | null;
  longitude: number | null;
}

const EMPTY: PhotoMetadata = { takenAt: null, latitude: null, longitude: null };

/**
 * Reads the date taken and the GPS position from a JPEG's Exif block. Returns empty values for a
 * file without them, which is what an app or a messaging service that strips metadata produces.
 * Nothing is validated beyond the structure: a date or position in a file can be edited, so this
 * only shows what is there.
 */
export function readPhotoMetadata(buffer: ArrayBuffer): PhotoMetadata {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return EMPTY;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return EMPTY;
    const marker = view.getUint8(offset + 1);
    // Start of scan: the image data follows and no metadata comes after it.
    if (marker === 0xda || marker === 0xd9) return EMPTY;
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && offset + 10 <= view.byteLength && readAscii(view, offset + 4, 6) === 'Exif\0\0') {
      try {
        return readTiff(view, offset + 10, Math.min(view.byteLength, offset + 2 + length));
      } catch {
        return EMPTY;
      }
    }
    offset += 2 + length;
  }
  return EMPTY;
}

function readAscii(view: DataView, start: number, length: number): string {
  let text = '';
  for (let index = 0; index < length && start + index < view.byteLength; index += 1)
    text += String.fromCharCode(view.getUint8(start + index));
  return text;
}

function readTiff(view: DataView, base: number, end: number): PhotoMetadata {
  const order = view.getUint16(base);
  if (order !== 0x4949 && order !== 0x4d4d) return EMPTY;
  const little = order === 0x4949;
  const u16 = (at: number) => {
    if (at + 2 > end) throw new RangeError('Exif runs past its segment');
    return view.getUint16(at, little);
  };
  const u32 = (at: number) => {
    if (at + 4 > end) throw new RangeError('Exif runs past its segment');
    return view.getUint32(at, little);
  };
  const entries = (ifdOffset: number) => {
    const start = base + ifdOffset;
    const count = u16(start);
    return Array.from({ length: count }, (_, index) => {
      const at = start + 2 + index * 12;
      return { tag: u16(at), type: u16(at + 2), count: u32(at + 4), valueAt: at + 8 };
    });
  };
  const ifd0 = entries(u32(base + 4));
  const pointer = (tag: number) => {
    const entry = ifd0.find((item) => item.tag === tag);
    return entry ? u32(entry.valueAt) : null;
  };
  const rational = (at: number) => {
    const denominator = u32(at + 4);
    return denominator === 0 ? Number.NaN : u32(at) / denominator;
  };

  let takenAt: string | null = null;
  const exifPointer = pointer(0x8769);
  if (exifPointer !== null) {
    const original = entries(exifPointer).find((item) => item.tag === 0x9003 && item.type === 2);
    if (original && original.count >= 19) {
      const text = readAscii(view, base + u32(original.valueAt), 19);
      if (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) takenAt = text;
    }
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  const gpsPointer = pointer(0x8825);
  if (gpsPointer !== null) {
    const gps = entries(gpsPointer);
    const ref = (tag: number) => {
      const entry = gps.find((item) => item.tag === tag);
      return entry ? String.fromCharCode(view.getUint8(entry.valueAt)) : null;
    };
    const degrees = (tag: number) => {
      const entry = gps.find((item) => item.tag === tag && item.type === 5 && item.count === 3);
      if (!entry) return null;
      const at = base + u32(entry.valueAt);
      const value = rational(at) + rational(at + 8) / 60 + rational(at + 16) / 3600;
      return Number.isFinite(value) ? value : null;
    };
    const lat = degrees(2);
    const lon = degrees(4);
    if (lat !== null && lon !== null && lat <= 90 && lon <= 180) {
      latitude = ref(1) === 'S' ? -lat : lat;
      longitude = ref(3) === 'W' ? -lon : lon;
    }
  }
  return { takenAt, latitude, longitude };
}

/** "2026:09:24 06:30:00" → "2026-09-24 06:30". */
export function formatExifDate(value: string): string {
  return `${value.slice(0, 10).replaceAll(':', '-')} ${value.slice(11, 16)}`;
}

// ---------------------------------------------------------------------------------------------------
// Payment per head
// ---------------------------------------------------------------------------------------------------

export const REWARD_CLASSES = [
  'deerBoarGibier',
  'deerBoarIncineration',
  'deerBoarOther',
  'bearMonkeySerow',
  'otherMammal',
  'bird',
  'custom',
] as const;
export type RewardClass = (typeof REWARD_CLASSES)[number];

/**
 * The national upper limits per head (per bird for birds) in 別記4 第3 of the guideline as revised
 * on 7 April 2026, p.109. Deer, boar, bear, monkey and serow exclude young animals; no amount for
 * young animals is written in that table, so `custom` is used for them. Areas under shipping
 * restrictions have their own rule (8,000 yen) that is not built in.
 */
export const NATIONAL_LIMITS: Record<Exclude<RewardClass, 'custom'>, { yen: number; label: Text }> = {
  deerBoarGibier: {
    yen: 9000,
    label: {
      ja: 'シカ・イノシシ（幼獣を除く）食肉処理施設等で搬入確認',
      en: 'Deer or boar (not young), confirmed at a meat processing facility',
    },
  },
  deerBoarIncineration: {
    yen: 8000,
    label: {
      ja: 'シカ・イノシシ（幼獣を除く）焼却施設等で搬入確認',
      en: 'Deer or boar (not young), confirmed at an incineration facility',
    },
  },
  deerBoarOther: {
    yen: 7000,
    label: {
      ja: 'シカ・イノシシ（幼獣を除く）上記以外（埋設など）',
      en: 'Deer or boar (not young), other (burial etc.)',
    },
  },
  bearMonkeySerow: {
    yen: 8000,
    label: { ja: 'クマ・サル・カモシカ（幼獣を除く）', en: 'Bear, monkey or serow (not young)' },
  },
  otherMammal: { yen: 1000, label: { ja: 'その他の獣類', en: 'Other mammals' } },
  bird: { yen: 200, label: { ja: '鳥類（1 羽）', en: 'Birds (per bird)' } },
};

export interface RewardRow {
  id: string;
  rewardClass: RewardClass;
  /** Only for `custom`: what the row is, and the national amount the person was told. */
  label: string;
  nationalYen: number;
  heads: number;
  prefectureYen: number;
  municipalityYen: number;
}

export interface RewardLine {
  id: string;
  perHeadYen: number;
  totalYen: number;
  nationalTotalYen: number;
}

const wholeNonNegative = (value: number) => Number.isInteger(value) && value >= 0;

/** The national amount of a row: the upper limit for its class, or what was entered for `custom`. */
export function nationalYen(row: Pick<RewardRow, 'rewardClass' | 'nationalYen'>): number {
  return row.rewardClass === 'custom' ? row.nationalYen : NATIONAL_LIMITS[row.rewardClass].yen;
}

/** Each row's amount per head and total, or null for a row with an amount that is not a whole number of yen or heads. */
export function rewardLine(row: RewardRow): RewardLine | null {
  const national = nationalYen(row);
  if (![national, row.heads, row.prefectureYen, row.municipalityYen].every(wholeNonNegative)) return null;
  const perHeadYen = national + row.prefectureYen + row.municipalityYen;
  return { id: row.id, perHeadYen, totalYen: perHeadYen * row.heads, nationalTotalYen: national * row.heads };
}

export function rewardTotal(rows: readonly RewardRow[]): { totalYen: number; heads: number; invalid: number } {
  let totalYen = 0;
  let heads = 0;
  let invalid = 0;
  for (const row of rows) {
    const line = rewardLine(row);
    if (!line) {
      invalid += 1;
      continue;
    }
    totalYen += line.totalYen;
    heads += row.heads;
  }
  return { totalYen, heads, invalid };
}

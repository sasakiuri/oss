/**
 * The time a JPEG photo was taken, from its Exif data (CIPA DC-008, Exif 2.32).
 *
 * Only what the trail camera tool needs is read: DateTimeOriginal (0x9003), or failing that
 * DateTimeDigitized (0x9004) or the file's DateTime (0x0132), and the matching offset from UTC
 * (OffsetTimeOriginal 0x9011, OffsetTimeDigitized 0x9012, OffsetTime 0x9010) when the camera wrote
 * one. Most trail cameras write no offset, so the time is a wall-clock time in whatever zone the
 * camera's clock was set to.
 */

export interface ExifTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Minutes east of UTC, or null when the photo does not say. */
  offsetMinutes: number | null;
  source: 'original' | 'digitized' | 'modified';
}

const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_ORIGINAL = 0x9003;
const TAG_DIGITIZED = 0x9004;
const TAG_OFFSET = 0x9010;
const TAG_OFFSET_ORIGINAL = 0x9011;
const TAG_OFFSET_DIGITIZED = 0x9012;

/** Reads exactly `YYYY:MM:DD HH:MM:SS`, refusing blanks, anything after it and impossible dates. */
export function parseExifDateTime(text: string): Omit<ExifTime, 'offsetMinutes' | 'source'> | null {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (year < 1900 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCDate() !== day) return null;
  return { year, month, day, hour, minute, second };
}

/** Reads exactly `±HH:MM`, an hour of 00 to 23 and a minute of 00 to 59, as minutes east of UTC. */
export function parseExifOffset(text: string): number | null {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const [hours, minutes] = [Number(match[2]), Number(match[3])];
  if (hours > 23 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return match[1] === '-' ? -total : total;
}

/** The capture time of a JPEG, or null when it has no readable Exif time. */
export function readExifTime(bytes: Uint8Array): ExifTime | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    // Start of scan: the image data follows and no more metadata segments come.
    if (marker === 0xda || marker === 0xd9) return null;
    const length = view.getUint16(at + 2);
    if (
      marker === 0xe1 &&
      at + 10 <= bytes.length &&
      String.fromCharCode(...bytes.subarray(at + 4, at + 10)) === 'Exif\0\0'
    )
      return readTiff(view, at + 10, Math.min(bytes.length, at + 2 + length));
    at += 2 + length;
  }
  return null;
}

function readTiff(view: DataView, start: number, end: number): ExifTime | null {
  if (start + 8 > end) return null;
  const order = view.getUint16(start);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  const u16 = (offset: number) => view.getUint16(offset, little);
  const u32 = (offset: number) => view.getUint32(offset, little);
  if (u16(start + 2) !== 42) return null;

  /** The ASCII values and the Exif pointer of one directory. */
  const readIfd = (offset: number) => {
    const values = new Map<number, string>();
    let exifPointer: number | null = null;
    const base = start + offset;
    if (offset <= 0 || base + 2 > end) return { values, exifPointer };
    const count = u16(base);
    for (let index = 0; index < count; index += 1) {
      const entry = base + 2 + index * 12;
      if (entry + 12 > end) break;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const length = u32(entry + 4);
      if (tag === TAG_EXIF_IFD) exifPointer = u32(entry + 8);
      // ASCII values of more than four bytes are stored at an offset.
      if (type === 2 && length > 0 && length < 64) {
        const from = length > 4 ? start + u32(entry + 8) : entry + 8;
        if (from + length > end) continue;
        let text = '';
        for (let byte = 0; byte < length; byte += 1) {
          const code = view.getUint8(from + byte);
          if (code === 0) break;
          text += String.fromCharCode(code);
        }
        values.set(tag, text);
      }
    }
    return { values, exifPointer };
  };

  const zeroth = readIfd(u32(start + 4));
  const exif = zeroth.exifPointer !== null ? readIfd(zeroth.exifPointer).values : new Map<number, string>();
  const candidates: [ExifTime['source'], string | undefined, string | undefined][] = [
    ['original', exif.get(TAG_ORIGINAL), exif.get(TAG_OFFSET_ORIGINAL)],
    ['digitized', exif.get(TAG_DIGITIZED), exif.get(TAG_OFFSET_DIGITIZED)],
    ['modified', zeroth.values.get(TAG_DATETIME), exif.get(TAG_OFFSET)],
  ];
  for (const [source, time, offset] of candidates) {
    const parsed = time ? parseExifDateTime(time) : null;
    if (!parsed) continue;
    // Exif fills an unknown offset with blanks around the colon.
    if (offset === undefined || /^ *:? *$/.test(offset)) return { ...parsed, offsetMinutes: null, source };
    // An offset the photo gives but that cannot be read leaves its instant unknown.
    const offsetMinutes = parseExifOffset(offset);
    return offsetMinutes === null ? null : { ...parsed, offsetMinutes, source };
  }
  return null;
}

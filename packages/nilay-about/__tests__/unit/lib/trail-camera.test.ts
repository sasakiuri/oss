import { describe, expect, it } from 'vitest';

import { parseExifDateTime, parseExifOffset, readExifTime } from '@/lib/exif';
import { photoInstant, summarise, type CameraSettings } from '@/lib/trail-camera';

/**
 * A minimal JPEG: SOI, an APP1 Exif segment whose IFD0 points to an Exif IFD holding
 * DateTimeOriginal (and optionally OffsetTimeOriginal), then EOI. Little-endian unless asked.
 */
function jpegWithTime(time: string, offset?: string, bigEndian = false): Uint8Array {
  const entries: [number, string][] = [[0x9003, `${time}\0`]];
  if (offset) entries.push([0x9011, `${offset}\0`]);
  const exifIfdOffset = 8 + 2 + 12 + 4;
  const exifIfdSize = 2 + entries.length * 12 + 4;
  let dataOffset = exifIfdOffset + exifIfdSize;
  const tiff = new Uint8Array(dataOffset + entries.reduce((sum, [, value]) => sum + value.length, 0));
  const view = new DataView(tiff.buffer);
  const little = !bigEndian;
  view.setUint16(0, bigEndian ? 0x4d4d : 0x4949);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  view.setUint16(8, 1, little);
  view.setUint16(10, 0x8769, little);
  view.setUint16(12, 4, little);
  view.setUint32(14, 1, little);
  view.setUint32(18, exifIfdOffset, little);
  view.setUint32(22, 0, little);
  view.setUint16(exifIfdOffset, entries.length, little);
  entries.forEach(([tag, value], index) => {
    const entry = exifIfdOffset + 2 + index * 12;
    view.setUint16(entry, tag, little);
    view.setUint16(entry + 2, 2, little);
    view.setUint32(entry + 4, value.length, little);
    view.setUint32(entry + 8, dataOffset, little);
    tiff.set(new TextEncoder().encode(value), dataOffset);
    dataOffset += value.length;
  });
  const header = new TextEncoder().encode('Exif\0\0');
  const segmentLength = 2 + header.length + tiff.length;
  const jpeg = new Uint8Array(2 + 4 + header.length + tiff.length + 2);
  const out = new DataView(jpeg.buffer);
  out.setUint16(0, 0xffd8);
  out.setUint16(2, 0xffe1);
  out.setUint16(4, segmentLength);
  jpeg.set(header, 6);
  jpeg.set(tiff, 6 + header.length);
  out.setUint16(jpeg.length - 2, 0xffd9);
  return jpeg;
}

describe('reading the Exif time', () => {
  it('reads DateTimeOriginal in either byte order', () => {
    for (const bigEndian of [false, true])
      expect(readExifTime(jpegWithTime('2026:11:15 06:42:10', undefined, bigEndian))).toEqual({
        year: 2026,
        month: 11,
        day: 15,
        hour: 6,
        minute: 42,
        second: 10,
        offsetMinutes: null,
        source: 'original',
      });
  });

  it('reads the offset when the camera wrote one', () => {
    expect(readExifTime(jpegWithTime('2026:11:15 06:42:10', '+09:00'))?.offsetMinutes).toBe(540);
    expect(parseExifOffset('-05:30')).toBe(-330);
  });

  it('refuses what is not a JPEG or not a real time', () => {
    expect(readExifTime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(readExifTime(jpegWithTime('0000:00:00 00:00:00'))).toBeNull();
    expect(parseExifDateTime('2026:02:30 10:00:00')).toBeNull();
  });

  // CIPA DC-008: 'YYYY:MM:DD HH:MM:SS' in 20 bytes with the NUL, and '±HH:MM' in 7.
  it('refuses a time with more after it or a field out of range', () => {
    expect(parseExifDateTime('2026:11:15 06:42:00xyz')).toBeNull();
    expect(parseExifDateTime('2026:11:15T06:42:00')).toBeNull();
    expect(parseExifDateTime('2026:11:15 06:42:60')).toBeNull();
    expect(parseExifDateTime('2026:11:15 24:00:00')).toBeNull();
    expect(parseExifDateTime('2026:11:15 06:42:59')).toMatchObject({ second: 59 });
  });

  it('refuses an offset that is not an hour and minute', () => {
    expect(parseExifOffset('+99:99')).toBeNull();
    expect(parseExifOffset('+09:60')).toBeNull();
    expect(parseExifOffset('+24:00')).toBeNull();
    expect(parseExifOffset('+09:00x')).toBeNull();
    expect(parseExifOffset('+14:00')).toBe(840);
  });

  it('does not put a photo with an unreadable offset in the camera’s zone instead', () => {
    expect(readExifTime(jpegWithTime('2026:11:15 06:42:10', '+99:99'))).toBeNull();
    // Blanks are how Exif says the offset is unknown.
    expect(readExifTime(jpegWithTime('2026:11:15 06:42:10', '   :  '))?.offsetMinutes).toBeNull();
  });
});

const photo = (name: string, text: string) => ({ name, time: readExifTime(jpegWithTime(text))! });
const japan: CameraSettings = { zoneOffsetMinutes: 540, clockCorrectionMinutes: 0, location: null };

describe('counting visits', () => {
  it('counts by date and hour in the camera zone', () => {
    const summary = summarise(
      [photo('a', '2026:11:15 06:42:10'), photo('b', '2026:11:15 06:10:00'), photo('c', '2026:11:16 23:59:00')],
      japan,
    );
    expect(summary.byDateHour.map((row) => row.date)).toEqual(['2026-11-15', '2026-11-16']);
    expect(summary.byDateHour[0]!.hours[6]).toBe(2);
    expect(summary.byHour[23]).toBe(1);
  });

  it('corrects a camera clock that ran fast', () => {
    const instant = photoInstant(photo('a', '2026:11:15 07:05:00').time, { ...japan, clockCorrectionMinutes: -10 });
    expect(instant.toISOString()).toBe('2026-11-14T21:55:00.000Z');
    const summary = summarise([photo('a', '2026:11:15 07:05:00')], { ...japan, clockCorrectionMinutes: -10 });
    expect(summary.byHour[6]).toBe(1);
  });

  it('places visits against sunrise and sunset, and by moon phase', () => {
    // Tokyo on 15 October 2026: sunrise about 5:47 JST, sunset about 17:08; a new moon on the 11th.
    const tokyo = { ...japan, location: { latitude: 35.6581, longitude: 139.7414 } };
    const summary = summarise([photo('a', '2026:10:15 06:20:00'), photo('b', '2026:10:15 17:30:00')], tokyo);
    expect(summary.fromSunrise.get(0)).toBe(1);
    expect(summary.fromSunset.get(0)).toBe(1);
    // Four days after new moon falls in the second of eight phases.
    expect(summary.byMoonPhase[1]).toBe(2);
  });
});

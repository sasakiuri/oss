// SPDX-License-Identifier: MIT
import { RedDotCoordinateConverter } from '@/main/modules/target/adapters/disag/RedDotCoordinateConverter';
import { hasValidRedDotBcc, RED_DOT_FRAME_LENGTH } from '@/main/modules/target/infra/parsers/disag/RedDotChecksum';

const STX = 0x02;
const CR = 0x0d;
const ETB = 0x17;
const TERMINATOR = 0x24;
const CR_OFFSETS = [9, 18, 21, 24, 28, 31, 36, 43, 49, 55] as const;
const RESERVED_RANGES = [
  [1, 9],
  [10, 18],
  [22, 24],
  [25, 28],
  [29, 31],
] as const;

export type RedDotFrameErrorCode =
  | 'INVALID_LENGTH'
  | 'INVALID_STX'
  | 'INVALID_ETB'
  | 'INVALID_TERMINATOR'
  | 'INVALID_CR'
  | 'INVALID_RESERVED_ASCII'
  | 'INVALID_BCC'
  | 'INVALID_DISCIPLINE'
  | 'INVALID_SCORE'
  | 'INVALID_DISTANCE'
  | 'INVALID_X'
  | 'INVALID_Y';

export class RedDotFrameDecodeError extends Error {
  constructor(
    readonly code: RedDotFrameErrorCode,
    readonly offset?: number,
  ) {
    super(offset === undefined ? code : `${code} at offset ${offset}`);
    this.name = 'RedDotFrameDecodeError';
  }
}

export interface RedDotParsedFrame {
  readonly discipline: 'LG';
  readonly scoreTenths: number;
  readonly distanceRaw: number;
  readonly distanceMm: number;
  readonly xRaw: number;
  readonly yRaw: number;
  readonly xMm: number;
  readonly yMm: number;
  readonly reserved: readonly [string, string, string, string, string];
}

/**
 * Returns a fixed-control-position error without duplicating the decoder's
 * structure rules in stream scanners.
 */
export function getRedDotFixedStructureError(frame: Buffer): RedDotFrameDecodeError | null {
  if (frame.length !== RED_DOT_FRAME_LENGTH) {
    return new RedDotFrameDecodeError('INVALID_LENGTH');
  }
  if (frame[0] !== STX) {
    return new RedDotFrameDecodeError('INVALID_STX', 0);
  }
  if (frame[56] !== ETB) {
    return new RedDotFrameDecodeError('INVALID_ETB', 56);
  }
  if (frame[58] !== TERMINATOR) {
    return new RedDotFrameDecodeError('INVALID_TERMINATOR', 58);
  }

  for (const offset of CR_OFFSETS) {
    if (frame[offset] !== CR) {
      return new RedDotFrameDecodeError('INVALID_CR', offset);
    }
  }

  return null;
}

/** Decodes and validates one complete 59-byte RedDot shot frame. */
export class RedDotFrameDecoder {
  private readonly coordinateConverter = new RedDotCoordinateConverter();

  decode(frame: Buffer): RedDotParsedFrame {
    const structureError = getRedDotFixedStructureError(frame);
    if (structureError) {
      throw structureError;
    }

    for (const [start, end] of RESERVED_RANGES) {
      for (let offset = start; offset < end; offset += 1) {
        const byte = frame[offset];
        if (byte === undefined || byte < 0x20 || byte > 0x7e) {
          throw new RedDotFrameDecodeError('INVALID_RESERVED_ASCII', offset);
        }
      }
    }

    if (!hasValidRedDotBcc(frame)) {
      throw new RedDotFrameDecodeError('INVALID_BCC', 57);
    }

    const discipline = this.readAscii(frame, 19, 21);
    if (discipline !== 'LG') {
      throw new RedDotFrameDecodeError('INVALID_DISCIPLINE', 19);
    }

    const scoreText = this.readAscii(frame, 32, 36);
    if (!/^(?:0[0-9]|10)\.[0-9]$/.test(scoreText)) {
      throw new RedDotFrameDecodeError('INVALID_SCORE', 32);
    }

    const distanceText = this.readAscii(frame, 37, 43);
    if (!/^[0-9]{4}\.[0-9]$/.test(distanceText)) {
      throw new RedDotFrameDecodeError('INVALID_DISTANCE', 37);
    }

    const xText = this.readAscii(frame, 44, 49);
    if (!/^[+-][0-9]{4}$/.test(xText)) {
      throw new RedDotFrameDecodeError('INVALID_X', 44);
    }

    const yText = this.readAscii(frame, 50, 55);
    if (!/^[+-][0-9]{4}$/.test(yText)) {
      throw new RedDotFrameDecodeError('INVALID_Y', 50);
    }

    const integerScore = Number.parseInt(scoreText.slice(0, 2), 10);
    const fractionalScore = Number.parseInt(scoreText[3]!, 10);
    const scoreTenths = integerScore * 10 + fractionalScore;
    if (scoreTenths < 0 || scoreTenths > 109) {
      throw new RedDotFrameDecodeError('INVALID_SCORE', 32);
    }

    const distanceRaw = Number(distanceText);
    const xRaw = Number.parseInt(xText, 10);
    const yRaw = Number.parseInt(yText, 10);
    const { xMm, yMm } = this.coordinateConverter.convert(xRaw, yRaw);
    const reserved = Object.freeze(
      RESERVED_RANGES.map(([start, end]) => this.readAscii(frame, start, end)),
    ) as RedDotParsedFrame['reserved'];

    return Object.freeze({
      discipline,
      scoreTenths,
      distanceRaw,
      distanceMm: distanceRaw / RedDotCoordinateConverter.RAW_UNITS_PER_MM,
      xRaw,
      yRaw,
      xMm,
      yMm,
      reserved,
    });
  }

  private readAscii(frame: Buffer, start: number, end: number): string {
    return frame.subarray(start, end).toString('ascii');
  }
}

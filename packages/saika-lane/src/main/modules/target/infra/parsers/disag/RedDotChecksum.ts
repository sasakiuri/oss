// SPDX-License-Identifier: MIT

export const RED_DOT_FRAME_LENGTH = 59;
export const RED_DOT_BCC_OFFSET = 57;

/**
 * Calculates the RedDot BCC over the bytes from STX through ETB.
 */
export function calculateRedDotBcc(bytesThroughEtb: Uint8Array): number {
  let value = 0;

  for (const byte of bytesThroughEtb) {
    value ^= byte;
  }

  return value < 0x20 ? value + 0x20 : value;
}

/**
 * Checks the BCC stored at offset 57 of a complete RedDot frame.
 */
export function hasValidRedDotBcc(frame: Buffer): boolean {
  return (
    frame.length === RED_DOT_FRAME_LENGTH &&
    calculateRedDotBcc(frame.subarray(0, RED_DOT_BCC_OFFSET)) === frame[RED_DOT_BCC_OFFSET]
  );
}

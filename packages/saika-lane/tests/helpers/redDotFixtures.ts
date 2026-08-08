// SPDX-License-Identifier: MIT
import { calculateRedDotBcc } from '@/main/modules/target/infra/parsers/disag/RedDotChecksum';

const VALID_FRAME_HEX =
  '0230303030303030300d30303030303030300d4c470d30310d312e300d30310d30392e300d303530302e300d2b303330300d2b303430300d173a24';
const SIGNED_FRAME_HEX =
  '0230303030303030300d30303030303030300d4c470d30310d312e300d30310d31302e310d303232332e360d2b303130300d2d303230300d173124';

export function validRedDotFrame(): Buffer {
  return Buffer.from(VALID_FRAME_HEX, 'hex');
}

export function signedRedDotFrame(): Buffer {
  return Buffer.from(SIGNED_FRAME_HEX, 'hex');
}

export function recalculateRedDotBcc(frame: Buffer): Buffer {
  const updated = Buffer.from(frame);
  updated[57] = calculateRedDotBcc(updated.subarray(0, 57));
  return updated;
}

export function replaceRedDotAscii(frame: Buffer, offset: number, value: string): Buffer {
  const updated = Buffer.from(frame);
  updated.write(value, offset, value.length, 'ascii');
  return recalculateRedDotBcc(updated);
}

// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { calculateRedDotBcc, hasValidRedDotBcc } from '@/main/modules/target/infra/parsers/disag/RedDotChecksum';

import { validRedDotFrame } from '../../../../../../helpers/redDotFixtures';

describe('RedDotChecksum', () => {
  it('validates the synthetic 59-byte frame and its 0x3a BCC', () => {
    const frame = validRedDotFrame();

    expect(frame).toHaveLength(59);
    expect(calculateRedDotBcc(frame.subarray(0, 57))).toBe(0x3a);
    expect(hasValidRedDotBcc(frame)).toBe(true);
  });

  it('adds 0x20 when the XOR result is below 0x20', () => {
    expect(calculateRedDotBcc(Uint8Array.from([0x02, 0x17]))).toBe(0x35);
  });

  it('rejects a changed BCC', () => {
    const frame = validRedDotFrame();
    frame[57] = frame[57]! ^ 0x01;

    expect(hasValidRedDotBcc(frame)).toBe(false);
  });

  it('rejects a non-59-byte buffer', () => {
    expect(hasValidRedDotBcc(validRedDotFrame().subarray(0, 58))).toBe(false);
  });
});

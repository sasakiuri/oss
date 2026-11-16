// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { DEVICE_DEFINITIONS, IMMEDIATE_SHOT_FEEDBACK_DEVICE_IDS } from '@/shared/target/targetDevices';

describe('targetDevices', () => {
  it('keeps the device ids, aliases and manufacturers in their published order', () => {
    expect(
      DEVICE_DEFINITIONS.map(({ id, aliases, manufacturer }) => ({ id, aliases: aliases ?? [], manufacturer })),
    ).toEqual([
      { id: 'MT201', aliases: [], manufacturer: 'KOHTO' },
      { id: 'BPT216', aliases: ['BP216'], manufacturer: 'KOHTO' },
      { id: 'BPT216_RS232', aliases: [], manufacturer: 'KOHTO' },
      { id: 'HS10', aliases: [], manufacturer: 'SIUS' },
      { id: 'HS25', aliases: [], manufacturer: 'SIUS' },
      { id: 'MEYTON_DEFAULT', aliases: [], manufacturer: 'MEYTON' },
      { id: 'DISAG_DEFAULT', aliases: [], manufacturer: 'DISAG' },
      { id: 'DISAG_KT_RDT_ZIE_1_RIFLE', aliases: [], manufacturer: 'DISAG' },
      { id: 'DISAG_KT_RDT_ZIE_1_PISTOL', aliases: [], manufacturer: 'DISAG' },
      { id: 'CUSTOM', aliases: [], manufacturer: 'CUSTOM' },
    ]);
  });

  it('gives immediate shot feedback for the decoded Kohto and RedDot targets, including the legacy BP216 id', () => {
    expect([...IMMEDIATE_SHOT_FEEDBACK_DEVICE_IDS]).toEqual([
      'MT201',
      'BPT216',
      'BP216',
      'BPT216_RS232',
      'DISAG_KT_RDT_ZIE_1_RIFLE',
      'DISAG_KT_RDT_ZIE_1_PISTOL',
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import { initialTargetSettings } from '@/app/(standalone)/labs/home-target/_store';
import { createSettingsHash, readSettingsHash } from '@/app/(standalone)/labs/home-target/share';

describe('shared target settings', () => {
  it('round-trips dimensions and print options without including unrelated saved data', () => {
    const settings = {
      ...initialTargetSettings,
      copies: 4 as const,
      showConditions: true,
      profiles: [{ name: 'Private setup' }],
    };
    const hash = createSettingsHash(settings);
    expect(readSettingsHash(hash)).toEqual({ ...initialTargetSettings, copies: 4, showConditions: true });
    expect(hash).not.toContain('Private');
  });
  it('rejects malformed links, invalid dimensions and unknown versions', () => {
    expect(readSettingsHash('')).toBeNull();
    for (const value of [
      '{broken',
      JSON.stringify({ version: 2, settings: initialTargetSettings }),
      JSON.stringify({ version: 1, settings: { ...initialTargetSettings, heightOfEye: { number: -1, unit: 'cm' } } }),
    ]) {
      expect(() => readSettingsHash(`#setup=${encodeURIComponent(value)}`)).toThrow();
    }
  });
});

import { z } from 'zod';

import { targetSettingsSchema, type TargetSettings } from './_store';

const sharedSettingsSchema = z.object({ version: z.literal(1), settings: targetSettingsSchema });

export function createSettingsHash(settings: TargetSettings): string {
  return `#${new URLSearchParams({ setup: JSON.stringify({ version: 1, settings: targetSettingsSchema.parse(settings) }) })}`;
}

export function readSettingsHash(hash: string): TargetSettings | null {
  const value = new URLSearchParams(hash.slice(1)).get('setup');
  if (value === null) return null;
  return sharedSettingsSchema.parse(JSON.parse(value)).settings;
}

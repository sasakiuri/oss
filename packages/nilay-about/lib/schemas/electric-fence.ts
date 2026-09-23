import { z } from 'zod';

export const fenceSpeciesSchema = z.enum(['boar', 'deer', 'deer-boar', 'monkey', 'bear', 'mesocarnivore']);
export type FenceSpecies = z.infer<typeof fenceSpeciesSchema>;

export const MAX_WIRE_ROWS = 12;

export const wireRowSchema = z.object({
  heightCm: z.number().finite().positive(),
  // A string the sources leave unpowered (a cord above the reach of a deer) still has to be bought.
  energized: z.boolean(),
});
export type WireRow = z.infer<typeof wireRowSchema>;

/** One powered line on its own short posts in front of the fence, for an animal that digs under it. */
export const outerWireSchema = z.object({
  enabled: z.boolean(),
  heightCm: z.number().finite().positive(),
  offsetCm: z.number().finite().nonnegative(),
});
export type OuterWire = z.infer<typeof outerWireSchema>;

export const electricFenceSettingsSchema = z
  .object({
    species: fenceSpeciesSchema,
    presetId: z.string().min(1),
    rows: z.array(wireRowSchema).max(MAX_WIRE_ROWS),
    outerWire: outerWireSchema,
    perimeterM: z.number().finite().positive(),
    gates: z.number().int().nonnegative(),
    corners: z.number().int().nonnegative(),
    roughLengthM: z.number().finite().nonnegative(),
    postSpacingM: z.number().finite().positive(),
    roughPostSpacingM: z.number().finite().positive(),
    sparePercent: z.number().finite().min(0).max(100),
    checked: z.array(z.string()),
  })
  .refine((settings) => settings.roughLengthM <= settings.perimeterM, { path: ['roughLengthM'] });
export type ElectricFenceSettings = z.infer<typeof electricFenceSettingsSchema>;

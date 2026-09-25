import { z } from 'zod';

/** Names are what the owner calls the thing: a model, "上", "Skeet", a brand and a load. */
export const GEAR_NAME_MAX_LENGTH = 60;
const nameSchema = z.string().trim().min(1).max(GEAR_NAME_MAX_LENGTH);
const idSchema = z.string().min(1);
const positive = z.number().finite().positive();

/** One barrel of a gun: an over-and-under has two, a repeater one, and a spare set adds more. */
export const gunBarrelSchema = z.object({
  id: idSchema,
  label: nameSchema,
  lengthCm: positive.nullable(),
});
export type GunBarrel = z.infer<typeof gunBarrelSchema>;

export const gunSchema = z.object({
  id: idSchema,
  name: nameSchema,
  /** As the owner writes it, such as "12" or "20"; a label, not a number to calculate with. */
  gauge: z.string().max(GEAR_NAME_MAX_LENGTH),
  barrels: z.array(gunBarrelSchema).min(1),
});
export type Gun = z.infer<typeof gunSchema>;

/** A choke tube or a fixed choke. Its constriction is optional, since makers mark it differently. */
export const chokeSchema = z.object({
  id: idSchema,
  name: nameSchema,
  constrictionMm: z.number().finite().nonnegative().nullable(),
});
export type Choke = z.infer<typeof chokeSchema>;

export const shotMaterialSchema = z.enum(['lead', 'iron', 'bismuth', 'tss', 'other']);
export type ShotMaterial = z.infer<typeof shotMaterialSchema>;

/** A cartridge by what the calculations need from it; the muzzle velocity is often not on the box. */
export const cartridgeSchema = z.object({
  id: idSchema,
  name: nameSchema,
  material: shotMaterialSchema,
  diameterMm: positive,
  densityGcm3: positive,
  chargeG: positive,
  muzzleSpeedMps: positive.nullable(),
});
export type Cartridge = z.infer<typeof cartridgeSchema>;

/** The combination shot together: one barrel of one gun, the choke in it and the cartridge fired. */
export const gearSetupSchema = z.object({
  id: idSchema,
  gunId: idSchema,
  barrelId: idSchema,
  chokeId: idSchema.nullable(),
  cartridgeId: idSchema.nullable(),
});
export type GearSetup = z.infer<typeof gearSetupSchema>;

export const shotgunGearSchema = z
  .object({
    guns: z.array(gunSchema),
    chokes: z.array(chokeSchema),
    cartridges: z.array(cartridgeSchema),
    setups: z.array(gearSetupSchema),
  })
  .superRefine((gear, context) => {
    // A setup that names something no longer registered would show a label nobody can find.
    gear.setups.forEach((setup, index) => {
      const gun = gear.guns.find((item) => item.id === setup.gunId);
      const known =
        gun !== undefined &&
        gun.barrels.some((barrel) => barrel.id === setup.barrelId) &&
        (setup.chokeId === null || gear.chokes.some((choke) => choke.id === setup.chokeId)) &&
        (setup.cartridgeId === null || gear.cartridges.some((cartridge) => cartridge.id === setup.cartridgeId));
      if (!known) context.addIssue({ code: 'custom', path: ['setups', index], message: 'setup names missing gear' });
    });
  });
export type ShotgunGear = z.infer<typeof shotgunGearSchema>;

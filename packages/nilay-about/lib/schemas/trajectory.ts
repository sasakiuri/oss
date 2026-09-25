import { z } from 'zod';

import { clickSettingSchema, distanceUnitSchema } from './sight-adjustment';

export type { ClickSetting, DistanceUnit } from './sight-adjustment';

export const dragModelSchema = z.enum(['g1', 'g7']);
export type DragModel = z.infer<typeof dragModelSchema>;

export const speedUnitSchema = z.enum(['mps', 'fps']);
export type SpeedUnit = z.infer<typeof speedUnitSchema>;

export const massUnitSchema = z.enum(['g', 'grain']);
export type MassUnit = z.infer<typeof massUnitSchema>;

/** Scope height is a small measurement, so centimetres would only ever be read as a decimal. */
export const sightHeightUnitSchema = z.enum(['mm', 'inch']);
export type SightHeightUnit = z.infer<typeof sightHeightUnitSchema>;

/** Drop and drift on the target are read in the larger units. */
export const dropUnitSchema = z.enum(['cm', 'inch']);
export type DropUnit = z.infer<typeof dropUnitSchema>;

export const temperatureUnitSchema = z.enum(['c', 'f']);
export type TemperatureUnit = z.infer<typeof temperatureUnitSchema>;

export const pressureUnitSchema = z.enum(['hpa', 'inhg']);
export type PressureUnit = z.infer<typeof pressureUnitSchema>;

export const altitudeUnitSchema = z.enum(['m', 'ft']);
export type AltitudeUnit = z.infer<typeof altitudeUnitSchema>;

export const windSpeedUnitSchema = z.enum(['mps', 'mph']);
export type WindSpeedUnit = z.infer<typeof windSpeedUnitSchema>;

/**
 * Which reading the air density is worked out from.
 *
 * `station` is the pressure a barometer reads at the firing point. It already carries the
 * height of the place, so no altitude is applied to it.
 *
 * `sea-level` is the pressure a forecast or an airfield quotes, which has been corrected
 * up to sea level. Getting back to the pressure at the firing point means taking the
 * height away again, so this reading needs the altitude alongside it.
 *
 * `altitude` has no reading at all: it puts the standard sea level pressure at that
 * height. It is the fallback when nothing was measured, and it cannot know the day.
 */
export const pressureSourceSchema = z.enum(['station', 'sea-level', 'altitude']);
export type PressureSource = z.infer<typeof pressureSourceSchema>;

/**
 * Where the wind blows from, on the shooter's clock face: 12 is straight into the
 * muzzle, 3 comes from the right, 6 is from behind, 9 comes from the left.
 */
export const windPresetSchema = z.enum(['12', '1:30', '3', '4:30', '6', '7:30', '9', '10:30', 'custom']);
export type WindPreset = z.infer<typeof windPresetSchema>;

/**
 * Every number stays finite even where the branch in use ignores it.
 *
 * A branch that is not in use is still carried, so switching back to it brings the last
 * reading rather than an empty field, and it is still saved, so it survives a reload.
 * JSON has no way to write a blank number, so a field that has to round-trip has to be
 * finite; what it does not have to be is sensible, and the checks below only ask that of
 * the fields the chosen branch actually reads.
 */
export const windSchema = z
  .object({
    speed: z.number().finite().nonnegative(),
    unit: windSpeedUnitSchema,
    preset: windPresetSchema,
    // A free angle is still read on the clock face, clockwise from 12 o'clock.
    customFromDegrees: z.number().finite(),
  })
  .superRefine((wind, context) => {
    if (wind.preset !== 'custom') return;
    if (wind.customFromDegrees < 0 || wind.customFromDegrees > 360)
      context.addIssue({
        code: 'custom',
        path: ['customFromDegrees'],
        message: 'A wind angle is read on the clock face, so it runs from 0 to 360 degrees.',
      });
  });
export type WindSetting = z.infer<typeof windSchema>;

// Air is a gas well away from freezing out or dissociating at any temperature a rifle sees.
const TEMPERATURE_RANGE_C = { min: -60, max: 60 } as const;
// The Dead Sea shore to above any mountain a rifle is carried up.
const ALTITUDE_RANGE_M = { min: -500, max: 9000 } as const;
const FEET_PER_METER = 1 / 0.3048;

const toCelsius = (value: number, unit: TemperatureUnit) => (unit === 'c' ? value : ((value - 32) * 5) / 9);
const fromCelsius = (value: number, unit: TemperatureUnit) => (unit === 'c' ? value : (value * 9) / 5 + 32);
const toMeters = (value: number, unit: AltitudeUnit) => (unit === 'm' ? value : value / FEET_PER_METER);
const fromMeters = (value: number, unit: AltitudeUnit) => (unit === 'm' ? value : value * FEET_PER_METER);

/**
 * The limits are a property of the air, not of the number typed: 70 °F is a warm day, not an
 * impossible one. A reading is checked in °C or metres, whatever unit it was entered in.
 */
export function temperatureInRange(value: number, unit: TemperatureUnit): boolean {
  const celsius = toCelsius(value, unit);
  return Number.isFinite(celsius) && celsius >= TEMPERATURE_RANGE_C.min && celsius <= TEMPERATURE_RANGE_C.max;
}

export function altitudeInRange(value: number, unit: AltitudeUnit): boolean {
  const meters = toMeters(value, unit);
  return Number.isFinite(meters) && meters >= ALTITUDE_RANGE_M.min && meters <= ALTITUDE_RANGE_M.max;
}

/** The same limits in the unit on screen, as whole numbers inside the range, for an error message. */
export function temperatureRange(unit: TemperatureUnit): { min: number; max: number } {
  return {
    min: Math.ceil(fromCelsius(TEMPERATURE_RANGE_C.min, unit)),
    max: Math.floor(fromCelsius(TEMPERATURE_RANGE_C.max, unit)),
  };
}

export function altitudeRange(unit: AltitudeUnit): { min: number; max: number } {
  return {
    min: Math.ceil(fromMeters(ALTITUDE_RANGE_M.min, unit)),
    max: Math.floor(fromMeters(ALTITUDE_RANGE_M.max, unit)),
  };
}

export const atmosphereSchema = z
  .object({
    source: pressureSourceSchema,
    temperature: z.object({ value: z.number().finite(), unit: temperatureUnitSchema }),
    pressure: z.object({ value: z.number().finite(), unit: pressureUnitSchema }),
    altitude: z.object({ value: z.number().finite(), unit: altitudeUnitSchema }),
  })
  .superRefine((atmosphere, context) => {
    if (!temperatureInRange(atmosphere.temperature.value, atmosphere.temperature.unit))
      context.addIssue({
        code: 'custom',
        path: ['temperature', 'value'],
        message: 'A temperature has to lie between -60 and 60 °C.',
      });
    if (atmosphere.source !== 'altitude' && atmosphere.pressure.value <= 0)
      context.addIssue({
        code: 'custom',
        path: ['pressure', 'value'],
        message: 'A pressure reading has to be greater than zero.',
      });
    if (atmosphere.source === 'station') return;
    if (!altitudeInRange(atmosphere.altitude.value, atmosphere.altitude.unit))
      context.addIssue({
        code: 'custom',
        path: ['altitude', 'value'],
        message: 'An altitude has to lie between -500 and 9000 metres.',
      });
  });
export type AtmosphereSetting = z.infer<typeof atmosphereSchema>;

/**
 * The card a trajectory is printed onto, to be cut out and carried to the shot.
 *
 * `stock` is a strip for the side of a stock or a scope cover, `business` the size of a
 * Japanese business card, and `a7` a quarter of A6 for a pocket. All three are printed at
 * their real size, so what is chosen here is what comes out of the printer.
 */
export const trajectoryCardSizeSchema = z.enum(['stock', 'business', 'a7']);
export type TrajectoryCardSize = z.infer<typeof trajectoryCardSizeSchema>;

/** How many cards are laid out on one A4 sheet. The layout reports when that many do not fit. */
export const trajectoryCardCopiesSchema = z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6)]);
export type TrajectoryCardCopies = z.infer<typeof trajectoryCardCopiesSchema>;

/**
 * Which reading of the drop the card carries: the length on the target in the unit the tool
 * is set to, the angle to dial on the sight, or that angle counted in the sight's own clicks.
 * A card is read to correct a sight, so all four are the same figure said in the unit the
 * sight is marked in.
 */
export const trajectoryCardDropSchema = z.enum(['offset', 'moa', 'mil', 'clicks']);
export type TrajectoryCardDrop = z.infer<typeof trajectoryCardDropSchema>;

/**
 * Which wind the drift column stands for.
 *
 * `wind` prints the wind that was entered, which is only right for that one wind. `per-speed`
 * prints the drift of a full value wind - straight across, from nine o'clock - of one unit of
 * speed, which is the form a card is read from in the field: read the column, multiply by the
 * wind you judge. `none` leaves the column out.
 */
export const trajectoryCardDriftSchema = z.enum(['none', 'wind', 'per-speed']);
export type TrajectoryCardDrift = z.infer<typeof trajectoryCardDriftSchema>;

/** Columns beyond drop and drift. They are printed in this order, whatever order they were picked in. */
export const TRAJECTORY_CARD_EXTRAS = ['time', 'speed', 'energy'] as const;
export const trajectoryCardExtraSchema = z.enum(TRAJECTORY_CARD_EXTRAS);
export type TrajectoryCardExtra = z.infer<typeof trajectoryCardExtraSchema>;

/** Long enough for a rifle and a load to be named, short enough to stay on one line of the card. */
export const TRAJECTORY_CARD_NAME_MAX = 40;

export const trajectoryCardSchema = z.object({
  size: trajectoryCardSizeSchema,
  copies: trajectoryCardCopiesSchema,
  // The card carries its own step and range: a table read at a desk and a card read at a shot
  // are not the same document, and a card with a row every 10 m has no room for anything else.
  step: z.number().finite().positive(),
  maxRange: z.number().finite().positive(),
  drop: trajectoryCardDropSchema,
  drift: trajectoryCardDriftSchema,
  extras: z.array(trajectoryCardExtraSchema),
  gun: z.string().max(TRAJECTORY_CARD_NAME_MAX),
  load: z.string().max(TRAJECTORY_CARD_NAME_MAX),
});
export type TrajectoryCardSetting = z.infer<typeof trajectoryCardSchema>;

/**
 * What the card opens on: drop and drift alone, out to the distance the table opens on.
 *
 * The names are empty because they belong to one shooter's rifle. Nothing else on the card
 * is optional - the load it was worked out for is printed whatever these are set to - so an
 * unnamed card still says which load it belongs to.
 */
export const initialTrajectoryCard: TrajectoryCardSetting = {
  size: 'business',
  copies: 2,
  step: 50,
  maxRange: 300,
  drop: 'offset',
  drift: 'wind',
  extras: [],
  gun: '',
  load: '',
};

/**
 * How the powder's temperature moves the muzzle velocity: a rate per degree, in the unit pair a
 * powder maker or a chronograph log gives it in. The rate has its own unit rather than borrowing
 * the velocity's and the temperature's, so a figure copied off a data sheet is typed as printed.
 */
export const powderSensitivityUnitSchema = z.enum(['mps-per-c', 'fps-per-f']);
export type PowderSensitivityUnit = z.infer<typeof powderSensitivityUnitSchema>;

export const powderTemperatureSchema = z
  .object({
    // Some powders lose a little velocity as they warm, so the rate may be negative.
    sensitivity: z.object({ value: z.number().finite(), unit: powderSensitivityUnitSchema }),
    unit: temperatureUnitSchema,
    reference: z.number().finite(),
    temperature: z.number().finite(),
  })
  .superRefine((powder, context) => {
    for (const key of ['reference', 'temperature'] as const)
      if (!temperatureInRange(powder[key], powder.unit))
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'A powder temperature has to lie between -60 and 60 °C.',
        });
  });
export type PowderTemperatureSetting = z.infer<typeof powderTemperatureSchema>;

/** Slopes a line of sight can have and still be one. Straight up or down there is no drop to speak of. */
export const INCLINE_LIMIT_DEGREES = 89;

/**
 * The turret tape: a strip wrapped round the elevation turret with the distances marked where
 * the turret stops for them. What it needs from the sight is where the strip goes round - the
 * circumference, which a strip of paper wrapped once measures more closely than a diameter - and
 * how many clicks one turn holds. `direction` is the way the numbers run when the tape is read
 * facing the turret, which differs from one maker to the next.
 */
export const turretTapeSchema = z.object({
  circumferenceMm: z.number().finite().positive(),
  clicksPerRevolution: z.number().int().positive(),
  step: z.number().finite().positive(),
  maxRange: z.number().finite().positive(),
  direction: z.enum(['left-to-right', 'right-to-left']),
});
export type TurretTapeSetting = z.infer<typeof turretTapeSchema>;

export const reticleUnitSchema = z.enum(['mil', 'moa']);
export type ReticleUnit = z.infer<typeof reticleUnitSchema>;

/**
 * The reticle the hold is drawn on: a plain scale in mil or MOA, not any maker's pattern. A second
 * focal plane reticle only reads true at the magnification it was calibrated at, so both are kept.
 */
export const reticleSchema = z
  .object({
    unit: reticleUnitSchema,
    focalPlane: z.enum(['ffp', 'sfp']),
    // Only a second focal plane reticle reads them, so a first focal plane one leaves them out.
    calibratedMagnification: z.number().finite().positive().optional(),
    magnification: z.number().finite().positive().optional(),
    distance: z.number().finite().positive(),
  })
  .refine(
    (reticle) =>
      reticle.focalPlane === 'ffp' ||
      (reticle.calibratedMagnification !== undefined && reticle.magnification !== undefined),
    { path: ['magnification'], message: 'A second focal plane reticle needs both magnifications.' },
  );
export type ReticleSetting = z.infer<typeof reticleSchema>;

/** Up to three more loads beside the one in the form, which makes the two to four the chart compares. */
export const MAX_COMPARED_LOADS = 3;

/** A load to compare, in the velocity and weight units of the main form so the columns line up. */
export const comparedLoadSchema = z.object({
  name: z.string().max(TRAJECTORY_CARD_NAME_MAX),
  muzzleSpeed: z.number().finite().positive(),
  mass: z.number().finite().positive(),
  ballisticCoefficient: z.number().finite().min(0.01).max(2),
  dragModel: dragModelSchema,
});
export type ComparedLoad = z.infer<typeof comparedLoadSchema>;

/**
 * What spreads the shots around the point that was aimed at, for the chance of a hit.
 *
 * The group is the rifle and the shooter together, given as the Rayleigh σ the group tool reports
 * or as the extreme spread of one group of so many shots. The others are the errors of the day:
 * the round-to-round spread of the muzzle velocity, the error in the wind the shooter reads, and
 * the error in the distance. Each is one standard deviation, in the unit of its own field.
 */
export const hitProbabilitySchema = z.object({
  groupMeasure: z.enum(['sigma', 'extreme-spread']),
  groupSize: z.number().finite().nonnegative(),
  groupUnit: reticleUnitSchema,
  groupShots: z.number().int().min(2).max(30),
  velocitySd: z.number().finite().nonnegative(),
  windSd: z.number().finite().nonnegative(),
  rangeSd: z.number().finite().nonnegative(),
  /** The chance of a hit the shooter asks of a shot, in per cent. */
  threshold: z.number().finite().gt(0).lt(100),
});
export type HitProbabilitySetting = z.infer<typeof hitProbabilitySchema>;

export const trajectorySettingsSchema = z.object({
  muzzleSpeed: z.object({ value: z.number().finite().positive(), unit: speedUnitSchema }),
  mass: z.object({ value: z.number().finite().positive(), unit: massUnitSchema }),
  // Published ballistic coefficients run from about 0.1 for a round ball to about 1.1 for
  // the longest match bullets, so anything outside this is a typing slip rather than a load.
  ballisticCoefficient: z.number().finite().min(0.01).max(2),
  dragModel: dragModelSchema,
  sightHeight: z.object({ value: z.number().finite().nonnegative(), unit: sightHeightUnitSchema }),
  distanceUnit: distanceUnitSchema,
  zeroDistance: z.number().finite().positive(),
  step: z.number().finite().positive(),
  maxRange: z.number().finite().positive(),
  dropUnit: dropUnitSchema,
  vitalRadius: z.number().finite().positive(),
  wind: windSchema,
  atmosphere: atmosphereSchema,
  // Added after the tool shipped, so settings saved before the card existed still parse and
  // open with the card's own defaults rather than being reported as an unreadable save.
  card: trajectoryCardSchema.default(initialTrajectoryCard),
  // Everything below was added after the tool shipped. Each is absent until the shooter enters it,
  // so settings saved before these fields existed are still read as they were saved, and the screen
  // shows each one as not entered rather than as a value nobody typed.
  humidityPercent: z.number().finite().min(0).max(100).optional(),
  inclineDegrees: z.number().finite().min(-INCLINE_LIMIT_DEGREES).max(INCLINE_LIMIT_DEGREES).optional(),
  powder: powderTemperatureSchema.optional(),
  clickValue: clickSettingSchema.optional(),
  turretTape: turretTapeSchema.optional(),
  reticle: reticleSchema.optional(),
  comparison: z.array(comparedLoadSchema).max(MAX_COMPARED_LOADS).optional(),
  hitProbability: hitProbabilitySchema.optional(),
});
export type TrajectorySettings = z.infer<typeof trajectorySettingsSchema>;

/** The altitude field is only read when the pressure has to be moved to the firing point. */
export function usesAltitude(source: PressureSource): boolean {
  return source !== 'station';
}

/** The pressure field is only read when there is a reading to start from. */
export function usesPressureReading(source: PressureSource): boolean {
  return source !== 'altitude';
}

import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  initialTrajectoryCard,
  trajectorySettingsSchema,
  type AtmosphereSetting,
  type ClickSetting,
  type ComparedLoad,
  type DistanceUnit,
  type DragModel,
  type DropUnit,
  type HitProbabilitySetting,
  type MassUnit,
  type PowderTemperatureSetting,
  type ReticleSetting,
  type SightHeightUnit,
  type SpeedUnit,
  type TrajectoryCardSetting,
  type TrajectorySettings,
  type TurretTapeSetting,
  type WindSetting,
} from '@/lib/schemas/trajectory';
import { convertMassValue, convertSpeedValue, convertWindSpeedValue } from '@/lib/trajectory-units';

export const storageKey = 'nilay-labs-trajectory-v1';

const savedSchema = z.object({
  settings: trajectorySettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface TrajectoryStore extends TrajectorySettings {
  lastValidSettings: TrajectorySettings;
  setMuzzleSpeed: (muzzleSpeed: { value: number; unit: SpeedUnit }) => void;
  setMass: (mass: { value: number; unit: MassUnit }) => void;
  setBallisticCoefficient: (ballisticCoefficient: number) => void;
  setDragModel: (dragModel: DragModel) => void;
  setSightHeight: (sightHeight: { value: number; unit: SightHeightUnit }) => void;
  setDistanceUnit: (distanceUnit: DistanceUnit) => void;
  setZeroDistance: (zeroDistance: number) => void;
  setStep: (step: number) => void;
  setMaxRange: (maxRange: number) => void;
  setDropUnit: (dropUnit: DropUnit) => void;
  setVitalRadius: (vitalRadius: number) => void;
  setWind: (wind: WindSetting) => void;
  setAtmosphere: (atmosphere: AtmosphereSetting) => void;
  setCard: (changes: Partial<TrajectoryCardSetting>) => void;
  /** `undefined` clears the field back to not entered. */
  setHumidityPercent: (humidityPercent: number | undefined) => void;
  setInclineDegrees: (inclineDegrees: number | undefined) => void;
  setPowder: (powder: PowderTemperatureSetting | undefined) => void;
  setClickValue: (clickValue: ClickSetting | undefined) => void;
  /** The sections start from a draft whose numbers are blank, and fill in as they are typed. */
  setTurretTape: (changes: Partial<TurretTapeSetting>) => void;
  setReticle: (changes: Partial<ReticleSetting>) => void;
  setComparison: (comparison: ComparedLoad[]) => void;
  setHitProbability: (changes: Partial<HitProbabilitySetting>) => void;
}

/**
 * Defaults: an ordinary centrefire rifle zeroed at 100 m in the reference atmosphere, with a light
 * crosswind and a target circle the size of a small animal's chest. Meant to be replaced.
 *
 * The humidity, the slope, the powder temperature, the click value and the settings of the sections
 * under the card open as not entered: they describe one shooter's day or rifle, so nothing is put in
 * for them. The screen says what the calculation does without each one.
 */
export const initialTrajectorySettings: TrajectorySettings = {
  muzzleSpeed: { value: 800, unit: 'mps' },
  mass: { value: 10.9, unit: 'g' },
  ballisticCoefficient: 0.45,
  dragModel: 'g1',
  sightHeight: { value: 40, unit: 'mm' },
  distanceUnit: 'm',
  zeroDistance: 100,
  step: 50,
  maxRange: 500,
  dropUnit: 'cm',
  vitalRadius: 5,
  wind: { speed: 4, unit: 'mps', preset: '9', customFromDegrees: 270 },
  atmosphere: {
    source: 'station',
    temperature: { value: 15, unit: 'c' },
    pressure: { value: 1013.25, unit: 'hpa' },
    altitude: { value: 0, unit: 'm' },
  },
  card: initialTrajectoryCard,
};

/**
 * What a section holds before anything is typed into it: the choices a select has to show, and the
 * numbers blank. A blank number is NaN in the form, which keeps the draft out of the saved settings
 * until every field of the section is filled in.
 */
export const blankTurretTape: TurretTapeSetting = {
  circumferenceMm: NaN,
  clicksPerRevolution: NaN,
  step: NaN,
  maxRange: NaN,
  direction: 'left-to-right',
};
export const blankReticle: ReticleSetting = { unit: 'mil', focalPlane: 'ffp', distance: NaN };
export const blankHitProbability: HitProbabilitySetting = {
  groupMeasure: 'extreme-spread',
  groupSize: NaN,
  groupUnit: 'moa',
  groupShots: NaN,
  velocitySd: NaN,
  windSd: NaN,
  rangeSd: NaN,
  threshold: NaN,
};

export const useTrajectoryStore = create<TrajectoryStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<TrajectorySettings>) => {
        const parsed = trajectorySettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialTrajectorySettings,
        lastValidSettings: initialTrajectorySettings,
        // The loads compared with this one and the velocity spread share its unit, so a change of
        // unit rewrites them too: 800 m/s read as 800 fps would be another load.
        setMuzzleSpeed: (muzzleSpeed) => {
          const { muzzleSpeed: current, comparison, hitProbability } = get();
          if (muzzleSpeed.unit === current.unit) return edit({ muzzleSpeed });
          const convert = (value: number) => convertSpeedValue(value, current.unit, muzzleSpeed.unit);
          edit({
            muzzleSpeed,
            ...(comparison && {
              comparison: comparison.map((load) => ({ ...load, muzzleSpeed: convert(load.muzzleSpeed) })),
            }),
            ...(hitProbability && {
              hitProbability: { ...hitProbability, velocitySd: convert(hitProbability.velocitySd) },
            }),
          });
        },
        setMass: (mass) => {
          const { mass: current, comparison } = get();
          if (mass.unit === current.unit) return edit({ mass });
          edit({
            mass,
            ...(comparison && {
              comparison: comparison.map((load) => ({
                ...load,
                mass: convertMassValue(load.mass, current.unit, mass.unit),
              })),
            }),
          });
        },
        setBallisticCoefficient: (ballisticCoefficient) => edit({ ballisticCoefficient }),
        setDragModel: (dragModel) => edit({ dragModel }),
        setSightHeight: (sightHeight) => edit({ sightHeight }),
        // Distances keep the typed number and are reread in the new unit.
        setDistanceUnit: (distanceUnit) => edit({ distanceUnit }),
        setZeroDistance: (zeroDistance) => edit({ zeroDistance }),
        setStep: (step) => edit({ step }),
        setMaxRange: (maxRange) => edit({ maxRange }),
        setDropUnit: (dropUnit) => edit({ dropUnit }),
        setVitalRadius: (vitalRadius) => edit({ vitalRadius }),
        setWind: (wind) => {
          const { wind: current, hitProbability } = get();
          if (wind.unit === current.unit) return edit({ wind });
          edit({
            wind,
            ...(hitProbability && {
              hitProbability: {
                ...hitProbability,
                windSd: convertWindSpeedValue(hitProbability.windSd, current.unit, wind.unit),
              },
            }),
          });
        },
        setAtmosphere: (atmosphere) => edit({ atmosphere }),
        setCard: (changes) => edit({ card: { ...get().card, ...changes } }),
        setHumidityPercent: (humidityPercent) => edit({ humidityPercent }),
        setInclineDegrees: (inclineDegrees) => edit({ inclineDegrees }),
        setPowder: (powder) => edit({ powder }),
        setClickValue: (clickValue) => edit({ clickValue }),
        setTurretTape: (changes) => edit({ turretTape: { ...(get().turretTape ?? blankTurretTape), ...changes } }),
        setReticle: (changes) => edit({ reticle: { ...(get().reticle ?? blankReticle), ...changes } }),
        // An empty list is no compared load at all, which is what the absent field already says.
        setComparison: (comparison) => edit({ comparison: comparison.length === 0 ? undefined : comparison }),
        setHitProbability: (changes) =>
          edit({ hitProbability: { ...(get().hitProbability ?? blankHitProbability), ...changes } }),
      };
    },
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: state.lastValidSettings }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success)
          return {
            ...current,
            ...parsed.data.settings,
            lastValidSettings: parsed.data.settings ?? current.lastValidSettings,
          };
        // A first visit stores nothing; only unreadable data is reported.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);

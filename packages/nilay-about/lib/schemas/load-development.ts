import { z } from 'zod';

import { LOAD_STEP_LIMIT } from '../load-development';

import { speedUnitSchema } from './trajectory';

export type { SpeedUnit } from './trajectory';

const finite = z.number().finite();

/** Room for a step's readings and their punctuation, and no room for a document. */
export const STEP_TEXT_MAX = 600;

/**
 * What the stepped value is measured in. It is a label only: the series is read in whatever unit it
 * was loaded in, and nothing here converts a charge.
 */
export const stepUnitSchema = z.enum(['gr', 'g', 'mm', 'none']);
export type StepUnit = z.infer<typeof stepUnitSchema>;

/**
 * How the impacts are recorded: the height alone, as a ladder is usually read, or both coordinates,
 * which is what comparing the centres of whole groups needs.
 */
export const impactModeSchema = z.enum(['vertical', 'both']);
export type ImpactMode = z.infer<typeof impactModeSchema>;

export const loadStepSchema = z.object({
  /** Stable across edits and deletions, so a row keeps its fields while the list changes. */
  id: z.string().min(1).max(40),
  value: finite,
  /** Velocities as typed, in the chosen speed unit. */
  velocities: z.string().max(STEP_TEXT_MAX),
  /** Impacts as typed, in millimetres: heights alone, or one "right up" pair per line. */
  impacts: z.string().max(STEP_TEXT_MAX),
});
export type LoadStep = z.infer<typeof loadStepSchema>;

export const loadDevelopmentSettingsSchema = z.object({
  stepUnit: stepUnitSchema,
  speedUnit: speedUnitSchema,
  impactMode: impactModeSchema,
  steps: z.array(loadStepSchema).min(1).max(LOAD_STEP_LIMIT),
  /** The change in average velocity between adjacent steps the shooter calls small, in speedUnit. */
  velocityThreshold: finite.nonnegative(),
  /** The movement of the group centre between adjacent steps the shooter calls small, in mm. */
  movementThreshold: finite.nonnegative(),
});
export type LoadDevelopmentSettings = z.infer<typeof loadDevelopmentSettingsSchema>;

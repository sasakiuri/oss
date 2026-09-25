import { z } from 'zod';

import { isIsoDate } from '../calendar-days';
import { PERMIT_PURPOSES } from '../permit-deadlines';

import { licenseTypeSchema } from './hunting-log';

/** A date field: empty until the reader fills it in, otherwise a real calendar date. */
export const optionalDateSchema = z.string().refine((value) => value === '' || isIsoDate(value));

export const PERMIT_DEADLINES_MAX_ITEMS = 12;
export const PERMIT_DEADLINES_MAX_LABEL = 40;

export const huntingLicenseEntrySchema = z.object({
  id: z.string().min(1).max(40),
  type: licenseTypeSchema,
  basis: z.enum(['exam', 'renewed']),
  date: optionalDateSchema,
});
export type HuntingLicenseEntry = z.infer<typeof huntingLicenseEntrySchema>;

export const extraDeadlineSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().max(PERMIT_DEADLINES_MAX_LABEL),
  date: optionalDateSchema,
});
export type ExtraDeadline = z.infer<typeof extraDeadlineSchema>;

export const purposeUseEntrySchema = z.object({
  purpose: z.enum(PERMIT_PURPOSES),
  permitted: z.boolean(),
  /** Empty when the gun has not been used for the purpose since the permit. */
  lastUsedOn: optionalDateSchema,
});
export type PurposeUseEntry = z.infer<typeof purposeUseEntrySchema>;

export const ALARM_OPTIONS = [60, 30, 7, 0] as const;

export const permitDeadlinesSettingsSchema = z.object({
  birthDate: optionalDateSchema,
  permitBasis: z.enum(['granted', 'renewed']),
  permitFrom: optionalDateSchema,
  gun: z.enum(['huntingGun', 'airGun']),
  courseIssuedOn: optionalDateSchema,
  skillsIssuedOn: optionalDateSchema,
  licenses: z.array(huntingLicenseEntrySchema).max(4),
  extras: z.array(extraDeadlineSchema).max(PERMIT_DEADLINES_MAX_ITEMS),
  alarms: z.array(z.union([z.literal(60), z.literal(30), z.literal(7), z.literal(0)])).max(ALARM_OPTIONS.length),
  checked: z.array(z.string().max(40)).max(20),
  dormant: z.object({
    grantedOn: optionalDateSchema,
    heldBeforeRuleStart: z.boolean(),
    uses: z.array(purposeUseEntrySchema).length(PERMIT_PURPOSES.length),
  }),
});
export type PermitDeadlinesSettings = z.infer<typeof permitDeadlinesSettingsSchema>;

import { z } from 'zod';

import { isIsoDate } from '../calendar-days';

import { licenseTypeSchema, prefectureSchema } from './hunting-log';

export const HUNTING_COSTS_MAX_REGISTRATIONS = 10;
export const HUNTING_COSTS_MAX_OTHER = 12;
export const HUNTING_COSTS_MAX_LABEL = 40;
/** Far above any fee or tax in the calculation, so a slip of the keyboard is caught. */
export const HUNTING_COSTS_MAX_YEN = 10_000_000;

const yenSchema = z.number().int().min(0).max(HUNTING_COSTS_MAX_YEN);

/** 地方税法 第七百条の五十二第二項: a registration for released-game hunting areas only, or one added to it. */
export const releaseAreaSchema = z.enum(['none', 'releaseOnly', 'releaseAdded']);
export type ReleaseArea = z.infer<typeof releaseAreaSchema>;

/**
 * 地方税法 附則 第三十二条・第三十二条の二:
 * - `half`: captures under permit (or as a permit holder's worker) in that prefecture within the year before applying;
 * - `capturer`: a member of a municipality's wildlife damage control team (対象鳥獣捕獲員);
 * - `certified`: a worker of a certified wildlife capture business holding a worker's certificate.
 */
export const taxReliefSchema = z.enum(['none', 'half', 'capturer', 'certified']);
export type TaxRelief = z.infer<typeof taxReliefSchema>;

export const heldLicenseSchema = z.object({
  type: licenseTypeSchema,
  /** 鳥獣保護管理法 第四十九条第一号: sits the examination for another kind while holding a licence. */
  partlyExempt: z.boolean(),
});
export type HeldLicense = z.infer<typeof heldLicenseSchema>;

export const costRegistrationSchema = z.object({
  id: z.string().min(1).max(40),
  prefecture: prefectureSchema,
  types: z.array(licenseTypeSchema).max(4),
  releaseArea: releaseAreaSchema,
  relief: taxReliefSchema,
  /**
   * The day the registration is made, or empty. 附則 第三十二条・第三十二条の二 cover registrations made up to
   * 31 March 2029, which falls inside the 2028 registration year, so that year needs the day.
   */
  registeredOn: z.string().refine((value) => value === '' || isIsoDate(value)),
});
export type CostRegistration = z.infer<typeof costRegistrationSchema>;

export const otherCostSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().max(HUNTING_COSTS_MAX_LABEL),
  amount: yenSchema,
});
export type OtherCost = z.infer<typeof otherCostSchema>;

export const feeScheduleSchema = z.object({
  exam: yenSchema,
  examPartlyExempt: yenSchema,
  renewal: yenSchema,
  registration: yenSchema,
});
export type FeeSchedule = z.infer<typeof feeScheduleSchema>;

export const huntingCostsSettingsSchema = z.object({
  /** The registration year (登録年度) in which the registrations are made, by the year it begins. */
  season: z.number().int().min(2015).max(2100),
  licenses: z.array(heldLicenseSchema).max(4),
  /** 地方税法 第七百条の五十二第一項第二号・第四号. */
  lowIncome: z.boolean(),
  registrations: z.array(costRegistrationSchema).max(HUNTING_COSTS_MAX_REGISTRATIONS),
  others: z.array(otherCostSchema).max(HUNTING_COSTS_MAX_OTHER),
  fees: feeScheduleSchema,
});
export type HuntingCostsSettings = z.infer<typeof huntingCostsSettingsSchema>;

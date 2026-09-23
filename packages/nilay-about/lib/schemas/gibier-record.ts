import { z } from 'zod';

/**
 * One animal's record, laid out after the items of 様式 2「捕獲・受入個体記録表（日報）」 in the
 * handbook for small game-meat facilities, and the items of 第 3（6）イ〜ヲ of the MHLW guideline.
 *
 * Every value is kept as typed, including the numbers, so a half-typed entry survives a reload and
 * nothing is rounded or dropped on the way in. The calculations in lib/gibier-record.ts read them.
 */

export const GIBIER_MAX_SHORT_TEXT = 60;
export const GIBIER_MAX_LONG_TEXT = 400;
/** Wide enough for a decimal such as 41.5 or 120.5, and nothing longer. */
export const GIBIER_MAX_NUMBER_TEXT = 8;

const shortText = z.string().max(GIBIER_MAX_SHORT_TEXT);
const longText = z.string().max(GIBIER_MAX_LONG_TEXT);
const numberText = z.string().max(GIBIER_MAX_NUMBER_TEXT);
/** The value of an `<input type="datetime-local">`, or empty. */
const dateTimeText = z.string().regex(/^$|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
/** The value of an `<input type="time">`, or empty. The form asks for the hour and minute only. */
const timeText = z.string().regex(/^$|^\d{2}:\d{2}$/);

/** 有／無 and はい／いいえ on the form. Empty until answered, because an unanswered item is not a no. */
export const gibierYesNoSchema = z.enum(['', 'yes', 'no']);
export type GibierYesNo = z.infer<typeof gibierYesNoSchema>;

export const gibierSpeciesSchema = z.enum(['', 'boar', 'deer', 'other']);
export type GibierSpecies = z.infer<typeof gibierSpeciesSchema>;

export const gibierMethodSchema = z.enum(['', 'gun', 'box', 'snare', 'other']);
export type GibierMethod = z.infer<typeof gibierMethodSchema>;

export const GIBIER_HIT_SITES = ['head', 'neck', 'chest', 'abdomen', 'behindEar', 'other'] as const;
export type GibierHitSite = (typeof GIBIER_HIT_SITES)[number];

export const GIBIER_SNARE_SITES = ['rightFore', 'leftFore', 'rightHind', 'leftHind', 'other'] as const;
export type GibierSnareSite = (typeof GIBIER_SNARE_SITES)[number];

export const GIBIER_DISINFECTIONS = ['alcohol', 'flame'] as const;
export type GibierDisinfection = (typeof GIBIER_DISINFECTIONS)[number];

/** The eleven items of 第 2 の 2（1）イ〜ル, in the guideline's order. */
export const GIBIER_ABNORMALITY_KEYS = [
  'unsteady',
  'neurological',
  'deformity',
  'parasites',
  'hairLoss',
  'emaciation',
  'wound',
  'abscess',
  'blisters',
  'diarrhoea',
  'otherVisible',
] as const;
export type GibierAbnormalityKey = (typeof GIBIER_ABNORMALITY_KEYS)[number];

// A list without repeats: a site ticked twice is a fault in whatever wrote it.
const uniqueList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .max(values.length)
    .refine((list) => new Set(list).size === list.length);

export const gibierRecordSchema = z.object({
  id: z.string().min(1).max(64),
  /** When the record was started, as an ISO string. Only orders the list. */
  createdAt: z.string().max(40),

  // 1. 捕獲に関する情報
  species: gibierSpeciesSchema,
  speciesOther: shortText,
  hunterName: shortText,
  licenseNumber: shortText,
  /** 発熱、下痢、嘔吐、風邪症状：有／無. `yes` means 有. */
  hunterSymptoms: gibierYesNoSchema,
  slaughtererName: shortText,
  slaughtererSymptoms: gibierYesNoSchema,
  capturedAt: dateTimeText,
  captureCity: shortText,
  captureArea: shortText,
  weather: shortText,
  method: gibierMethodSchema,
  methodOther: shortText,
  hitSites: uniqueList(GIBIER_HIT_SITES),
  hitSiteOther: shortText,
  /**
   * 第 3（6）ホ asks for the method of the kill as well as the site; 様式 2 has no box for it. Whether a
   * gun was used is kept on its own, because it decides whether a site in the abdomen is a bullet wound.
   */
  slaughterByGun: gibierYesNoSchema,
  slaughterMethod: shortText,
  snareSites: uniqueList(GIBIER_SNARE_SITES),
  snareSiteOther: shortText,
  injury: gibierYesNoSchema,
  injurySite: shortText,
  knifeDisinfection: uniqueList(GIBIER_DISINFECTIONS),
  bleeding: gibierYesNoSchema,
  bleedingStartedAt: dateTimeText,
  bleedingPlace: shortText,
  arteryCut: gibierYesNoSchema,
  bloodAppearance: z.enum(['', 'normal', 'abnormal']),
  bloodAppearanceNote: shortText,
  palpation: z.enum(['', 'high', 'normal', 'low']),
  bodyTemperature: numberText,
  temperatureSite: shortText,
  evisceration: gibierYesNoSchema,
  eviscerationStartedAt: timeText,
  eviscerationPlace: shortText,
  // 第 3（6）ヌ: the method, and whether the organs and the smell were abnormal. Not boxes on 様式 2.
  eviscerationMethod: shortText,
  organAbnormality: gibierYesNoSchema,
  organAbnormalityNote: shortText,
  odorAbnormality: gibierYesNoSchema,
  odorAbnormalityNote: shortText,
  cooling: gibierYesNoSchema,
  coolingStartedAt: timeText,
  coolingMethod: shortText,
  deliveredAt: dateTimeText,
  notes: longText,

  // 2. 個体に関する情報
  sex: z.enum(['', 'male', 'female']),
  pregnant: gibierYesNoSchema,
  estimatedAge: numberText,
  weightKg: numberText,
  abnormalities: z.object(
    Object.fromEntries(GIBIER_ABNORMALITY_KEYS.map((key) => [key, gibierYesNoSchema])) as Record<
      GibierAbnormalityKey,
      typeof gibierYesNoSchema
    >,
  ),
});
export type GibierRecord = z.infer<typeof gibierRecordSchema>;

export type GibierTextKey = {
  [K in keyof GibierRecord]: GibierRecord[K] extends string ? K : never;
}[keyof GibierRecord];

export const emptyGibierAbnormalities = Object.fromEntries(GIBIER_ABNORMALITY_KEYS.map((key) => [key, ''])) as Record<
  GibierAbnormalityKey,
  GibierYesNo
>;

/** A blank record. The id and the time are passed in, so a test can pin them. */
export function createGibierRecord(id: string, createdAt: string): GibierRecord {
  return {
    id,
    createdAt,
    species: '',
    speciesOther: '',
    hunterName: '',
    licenseNumber: '',
    hunterSymptoms: '',
    slaughtererName: '',
    slaughtererSymptoms: '',
    capturedAt: '',
    captureCity: '',
    captureArea: '',
    weather: '',
    method: '',
    methodOther: '',
    hitSites: [],
    hitSiteOther: '',
    slaughterByGun: '',
    slaughterMethod: '',
    snareSites: [],
    snareSiteOther: '',
    injury: '',
    injurySite: '',
    knifeDisinfection: [],
    bleeding: '',
    bleedingStartedAt: '',
    bleedingPlace: '',
    arteryCut: '',
    bloodAppearance: '',
    bloodAppearanceNote: '',
    palpation: '',
    bodyTemperature: '',
    temperatureSite: '',
    evisceration: '',
    eviscerationStartedAt: '',
    eviscerationPlace: '',
    eviscerationMethod: '',
    organAbnormality: '',
    organAbnormalityNote: '',
    odorAbnormality: '',
    odorAbnormalityNote: '',
    cooling: '',
    coolingStartedAt: '',
    coolingMethod: '',
    deliveredAt: '',
    notes: '',
    sex: '',
    pregnant: '',
    estimatedAge: '',
    weightKg: '',
    abnormalities: { ...emptyGibierAbnormalities },
  };
}

import { z } from 'zod';

/** combined: one tag carrying both the hunting and the permit items, for traps used under both. */
export const trapTagPurposeSchema = z.enum(['hunting', 'permit', 'combined']);
export type TrapTagPurpose = z.infer<typeof trapTagPurposeSchema>;

// Every character on the tag is at least 10 mm wide, so long values cannot fit.
export const TRAP_TAG_MAX_FIELD_LENGTH = 120;

const requiredField = z.string().trim().min(1).max(TRAP_TAG_MAX_FIELD_LENGTH);

/** 法第 62 条第 3 項・施行規則第 70 条第 1 項 */
export const huntingTagSchema = z.object({
  address: requiredField,
  name: requiredField,
  governor: requiredField,
  fiscalYear: requiredField,
  registrationNumber: requiredField,
});

/** 法第 9 条第 12 項・施行規則第 7 条第 17 項 */
export const permitTagSchema = z.object({
  address: requiredField,
  name: requiredField,
  authority: requiredField,
  validPeriod: requiredField,
  permitNumber: requiredField,
  species: requiredField,
});

export const combinedTagSchema = permitTagSchema.merge(huntingTagSchema);

export const trapTagSchemas = {
  hunting: huntingTagSchema,
  permit: permitTagSchema,
  combined: combinedTagSchema,
} as const;

export type HuntingTagFields = z.infer<typeof huntingTagSchema>;
export type PermitTagFields = z.infer<typeof permitTagSchema>;

// The statutory order of the items, which is also the printed order.
export const TRAP_TAG_FIELDS = {
  hunting: ['address', 'name', 'governor', 'fiscalYear', 'registrationNumber'],
  permit: ['address', 'name', 'authority', 'validPeriod', 'permitNumber', 'species'],
  // The shared address and name, then the permit items, then the hunting registration.
  combined: [
    'address',
    'name',
    'authority',
    'validPeriod',
    'permitNumber',
    'species',
    'governor',
    'fiscalYear',
    'registrationNumber',
  ],
} as const;
export type TrapTagFieldKey = (typeof TRAP_TAG_FIELDS)[TrapTagPurpose][number];

// Half-finished input stays editable, so the stored draft only guards its shape.
// The address and the name are shared by both purposes and keep their value when
// the purpose changes.
const draftField = z.string().max(TRAP_TAG_MAX_FIELD_LENGTH);
export const trapTagDraftSchema = z.object({
  address: draftField,
  name: draftField,
  governor: draftField,
  fiscalYear: draftField,
  registrationNumber: draftField,
  authority: draftField,
  validPeriod: draftField,
  permitNumber: draftField,
  species: draftField,
});
export type TrapTagDraft = z.infer<typeof trapTagDraftSchema>;

export const emptyTrapTagDraft: TrapTagDraft = {
  address: '',
  name: '',
  governor: '',
  fiscalYear: '',
  registrationNumber: '',
  authority: '',
  validPeriod: '',
  permitNumber: '',
  species: '',
};

export type TrapTagFieldError = 'required' | 'tooLong';

export interface TrapTagValidation {
  valid: boolean;
  values: Record<string, string> | null;
  errors: Partial<Record<TrapTagFieldKey, TrapTagFieldError>>;
}

/** Items chosen to be left blank and written by hand are not required. */
export function validateTrapTagFields(
  purpose: TrapTagPurpose,
  values: Record<string, string>,
  blanks: readonly TrapTagFieldKey[] = [],
): TrapTagValidation {
  const result = trapTagSchemas[purpose].safeParse(values);
  if (result.success) return { valid: true, values: result.data, errors: {} };
  const errors: Partial<Record<TrapTagFieldKey, TrapTagFieldError>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as TrapTagFieldKey | undefined;
    if (!key) continue;
    const error = issue.code === 'too_big' ? 'tooLong' : 'required';
    if (error === 'required' && blanks.includes(key)) continue;
    errors[key] = error;
  }
  if (Object.keys(errors).length === 0) return { valid: true, values: { ...values }, errors: {} };
  return { valid: false, values: null, errors };
}

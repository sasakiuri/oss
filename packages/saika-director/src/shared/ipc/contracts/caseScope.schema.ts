import { z } from 'zod';

const uuidSchema = z.string().uuid();

/** The kind of record a case is linked to. */
export const caseScopeTypeSchema = z.enum(['COMPETITION', 'EVENT']);

/** One competition or event link of a case. */
export const caseScopeDtoSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  scopeType: caseScopeTypeSchema,
  scopeId: z.string().min(1),
  linkedBy: z.string().min(1),
  note: z.string().min(1).nullable(),
  linkedAt: z.string().datetime(),
});

/** A competition or event that a case is listed or opened under. */
export const caseScopeInputSchema = z.object({
  scopeType: caseScopeTypeSchema,
  scopeId: z.string().trim().min(1).max(200),
});

/** Links one more competition or event to a case. */
export const linkCaseScopeInputSchema = z.object({
  caseId: uuidSchema,
  scope: caseScopeInputSchema,
  linkedBy: z.string().trim().min(1).max(200),
  note: z.string().trim().min(1).max(1000).optional(),
});

/** Rejects a case creation whose scope links repeat a competition or event. */
export function refineUniqueCaseScopes(
  value: { readonly scopes: readonly CaseScopePayload[] },
  context: z.RefinementCtx,
) {
  const keys = value.scopes.map((scope) => `${scope.scopeType}:${scope.scopeId}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: 'custom', path: ['scopes'], message: 'Scope links must be unique' });
  }
}

export type CaseScopeDto = z.infer<typeof caseScopeDtoSchema>;
export type CaseScopePayload = z.infer<typeof caseScopeInputSchema>;
export type LinkCaseScopePayload = z.infer<typeof linkCaseScopeInputSchema>;

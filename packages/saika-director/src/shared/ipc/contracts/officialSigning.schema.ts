import { z } from 'zod';

export const officialSigningEvidenceSchema = z.object({
  method: z.enum(['AUTHENTICATED', 'MANUAL', 'EXTERNAL']),
  actorId: z.string().uuid().nullable(),
  recordedBy: z.string().trim().min(1).max(200),
  evidenceReference: z.string().trim().min(1).max(2000).nullable(),
});

/** A personal signature by the requesting operator, or an external signature recorded with its evidence. */
const officialSigningMethodSchema = z.enum(['SELF', 'EXTERNAL']);

export const officialSigningRequestFields = {
  method: officialSigningMethodSchema.optional(),
  recordedBy: z.string().trim().min(1).max(200).optional(),
  evidenceReference: z.string().trim().min(1).max(2000).optional(),
};

export type OfficialSigningMethod = z.infer<typeof officialSigningMethodSchema>;

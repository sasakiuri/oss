import { z } from 'zod';

export const officialSigningEvidenceSchema = z.object({
  method: z.enum(['AUTHENTICATED', 'MANUAL', 'EXTERNAL']),
  actorId: z.string().uuid().nullable(),
  recordedBy: z.string().trim().min(1).max(200),
  evidenceReference: z.string().trim().min(1).max(2000).nullable(),
});

export const officialSigningRequestFields = {
  method: z.enum(['SELF', 'EXTERNAL']).optional(),
  recordedBy: z.string().trim().min(1).max(200).optional(),
  evidenceReference: z.string().trim().min(1).max(2000).optional(),
};

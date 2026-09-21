import { z } from 'zod';

import { MAX_TARGET_DIAMETER_CM } from './model';

export const targetPdfRequestSchema = z.object({
  blackAreaSize: z.object({
    number: z.number().finite().positive().max(MAX_TARGET_DIAMETER_CM),
    unit: z.literal('cm'),
  }),
});

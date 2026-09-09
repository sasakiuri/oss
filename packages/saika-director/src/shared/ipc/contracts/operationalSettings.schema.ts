import { z } from 'zod';

export const OperationalModeSchema = z.enum(['DISABLED', 'ADVISORY', 'REQUIRED']);
export const OperationalModesSchema = z
  .record(z.string().min(1).max(100), OperationalModeSchema)
  .refine((value) => Object.keys(value).length <= 100, 'Choose at most 100 settings');

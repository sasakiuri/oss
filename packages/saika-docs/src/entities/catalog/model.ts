// SPDX-License-Identifier: MIT
import { z } from 'zod';

import type { components } from '@/shared/api/generated';

export const catalogItemSchema: z.ZodType<components['schemas']['CatalogItem']> = z.object({
  id: z.string(),
  title: z.string(),
  href: z.string().startsWith('/'),
  description: z.string(),
});
export const catalogSchema = z.array(catalogItemSchema);
export type CatalogItem = z.infer<typeof catalogItemSchema>;

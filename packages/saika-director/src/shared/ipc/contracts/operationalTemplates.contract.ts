import { z } from 'zod';

import {
  command,
  commandDataResponseSchema,
  CommandResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '../defineContract';
import { OperationalModesSchema } from './operationalSettings.schema';

const details = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  modes: OperationalModesSchema.refine(
    (value) => Object.keys(value).length > 0,
    'Choose settings before saving a template',
  ),
});
export const OperationalTemplateSchema = details.extend({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});
export const SaveOperationalTemplateSchema = details
  .extend({
    id: z.string().uuid().optional(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .refine(
    (value) => (value.id ? value.expectedRevision > 0 : value.expectedRevision === 0),
    'Reload the template before updating it',
  );
export const RemoveOperationalTemplateSchema = z.object({
  id: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
});

export type OperationalTemplateDto = z.infer<typeof OperationalTemplateSchema>;
export type SaveOperationalTemplateInput = z.infer<typeof SaveOperationalTemplateSchema>;

export const operationalTemplatesContract = defineContract('operationalTemplates', {
  list: query(z.object({}), queryResponseSchema(z.array(OperationalTemplateSchema))),
  save: command(SaveOperationalTemplateSchema, commandDataResponseSchema(OperationalTemplateSchema)),
  remove: command(RemoveOperationalTemplateSchema, CommandResponseSchema),
});

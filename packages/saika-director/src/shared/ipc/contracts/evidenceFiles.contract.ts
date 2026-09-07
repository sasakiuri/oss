import { z } from 'zod';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const file = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  evidenceId: z.string().uuid(),
  fileName: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().nonnegative(),
  importedBy: z.string().min(1),
  importedAt: z.string().datetime(),
  statement: z.string().min(1),
});
export type EvidenceFileDto = z.infer<typeof file>;
export const evidenceFilesContract = defineContract('evidenceFiles', {
  list: query(z.object({ evidenceId: z.string().uuid() }), queryResponseSchema(z.array(file))),
  importFile: command(
    z.object({
      id: z.string().uuid(),
      caseId: z.string().uuid(),
      evidenceId: z.string().uuid(),
      importedBy: z.string().trim().min(1).max(200),
      statement: z.string().trim().min(1).max(2000),
    }),
    commandDataResponseSchema(file.nullable()),
  ),
  exportFile: command(z.object({ id: z.string().uuid() }), commandDataResponseSchema(z.object({ saved: z.boolean() }))),
});

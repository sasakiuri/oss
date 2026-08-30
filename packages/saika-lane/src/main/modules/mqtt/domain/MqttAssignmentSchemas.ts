// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const AthleteSchema = z.object({
  startNumber: z.number().int().positive(),
  id: z.string(),
  name: z.string(),
  teamName: z.string().optional(),
  teamId: z.string().optional(),
  gender: z.enum(['M', 'F', 'X', 'UNSPECIFIED']).optional(),
  nationCode: z.string().optional(),
  issfCode: z.string().optional(),
});

export const LaneAssignmentPayloadSchema = z.object({
  competitionId: z.string().uuid(),
  laneId: z.string().uuid(),
  athlete: AthleteSchema.nullable(),
  assignedAt: z.string().datetime().nullable(),
  publishedAt: z.string().datetime(),
});

export type Athlete = z.infer<typeof AthleteSchema>;
export type LaneAssignmentPayload = z.infer<typeof LaneAssignmentPayloadSchema>;

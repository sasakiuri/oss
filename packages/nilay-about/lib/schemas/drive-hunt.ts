import { z } from 'zod';

import { geoPointSchema } from './shot-danger';

export const DRIVE_TEXT_MAX = 200;
export const DRIVE_NOTE_MAX = 1000;
export const MAX_STANDS = 40;
export const MAX_PARTICIPANTS = 60;
export const MAX_NO_FIRE_SECTORS = 4;

export const participantRoleSchema = z.enum(['stand', 'beater', 'dog', 'leader', 'other']);
export type ParticipantRole = z.infer<typeof participantRoleSchema>;

export const participantSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(DRIVE_TEXT_MAX),
  role: participantRoleSchema,
});
export type Participant = z.infer<typeof participantSchema>;

/** A direction the stand must not shoot into, clockwise from one bearing to another (true north). */
export const noFireSectorSchema = z.object({
  from: z.number().finite().min(0).max(360),
  to: z.number().finite().min(0).max(360),
});
export type NoFireSector = z.infer<typeof noFireSectorSchema>;

export const standSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(20),
  position: geoPointSchema,
  noFire: z.array(noFireSectorSchema).max(MAX_NO_FIRE_SECTORS),
  assigneeId: z.string().nullable(),
});
export type Stand = z.infer<typeof standSchema>;

export const driveHuntPlanSchema = z.object({
  title: z.string().max(DRIVE_TEXT_MAX),
  date: z.string().max(10),
  meeting: z.string().max(DRIVE_TEXT_MAX),
  radio: z.string().max(DRIVE_TEXT_MAX),
  notes: z.string().max(DRIVE_NOTE_MAX),
  /** How long the no-fire wedges are drawn, in metres: a drawing length, not a safe distance. */
  sectorLength: z.number().finite().min(50).max(3000),
  stands: z.array(standSchema).max(MAX_STANDS),
  participants: z.array(participantSchema).max(MAX_PARTICIPANTS),
});
export type DriveHuntPlan = z.infer<typeof driveHuntPlanSchema>;

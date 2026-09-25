import { z } from 'zod';

import {
  MEMBER_NAME_MAX_LENGTH,
  PASSPHRASE_MAX_LENGTH,
  PASSPHRASE_MIN_LENGTH,
  ROOM_HOURS_OPTIONS,
} from '@/lib/location-share';

import { latitudeSchema, longitudeSchema } from './push';

export const roomIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
export const passphraseSchema = z.string().min(PASSPHRASE_MIN_LENGTH).max(PASSPHRASE_MAX_LENGTH);
export const memberNameSchema = z.string().trim().min(1).max(MEMBER_NAME_MAX_LENGTH);

export const createRoomSchema = z.object({
  passphrase: passphraseSchema,
  name: memberNameSchema,
  hours: z.number().refine((value) => (ROOM_HOURS_OPTIONS as readonly number[]).includes(value)),
});
export const joinRoomSchema = z.object({ passphrase: passphraseSchema, name: memberNameSchema });

export const positionSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  accuracy: z.number().finite().min(0).max(100_000),
});

export const membershipSchema = z.object({
  roomId: z.string(),
  memberId: z.string(),
  memberToken: z.string(),
  host: z.boolean(),
  expiresAt: z.string(),
});
export type Membership = z.infer<typeof membershipSchema>;

export const roomViewSchema = z.object({
  expiresAt: z.string(),
  members: z.array(
    z.object({
      memberId: z.string(),
      name: z.string(),
      position: z
        .object({ latitude: z.number(), longitude: z.number(), accuracy: z.number(), at: z.number() })
        .nullable(),
    }),
  ),
});
export type RoomView = z.infer<typeof roomViewSchema>;

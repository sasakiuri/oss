import 'server-only';

import { z } from 'zod';

import { ROOM_MEMBERS_MAX } from '@/lib/location-share';
import type { Membership, RoomView } from '@/lib/schemas/location-share';
import { secretsEqual } from '@/lib/server/guards';
import { RequestError } from '@/lib/server/http';
import { createToken, hashPassphrase, hashToken, verifyPassphrase } from '@/lib/server/secrets';
import { withinLimit, type LabsStore } from '@/lib/server/store';

import { safeJson } from './push';

const roomSchema = z.object({ passphraseHash: z.string(), expiresAt: z.number(), hostMemberId: z.string() });
const memberSchema = z.object({ tokenHash: z.string(), name: z.string() });
const storedPositionSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number(),
  at: z.number(),
});

const roomKey = (id: string) => `labs:room:${id}`;
const membersKey = (id: string) => `labs:room:${id}:members`;
const positionsKey = (id: string) => `labs:room:${id}:positions`;
const ACTIVE_ROOMS_KEY = 'labs:rooms:active';

/**
 * Limits. Passphrase guesses are counted per room and address and per room in all, in Redis itself,
 * so an unreachable Redis refuses the attempt rather than allowing it. Polling is limited per member,
 * not per address, so a party behind one mobile network address is not refused.
 */
export const ROOM_LIMITS = {
  joinPerAddress: { max: 5, windowSeconds: 60 },
  joinPerRoom: { max: 30, windowSeconds: 60 },
  pollPerMember: { max: 30, windowSeconds: 60 },
  roomsPerDay: { max: 1000, windowSeconds: 86_400 },
  activeRooms: 200,
} as const;

export function createLocationRooms(dependencies: { store: () => LabsStore; now?: () => number }) {
  const now = dependencies.now ?? Date.now;
  const store = () => dependencies.store();

  async function loadRoom(roomId: string) {
    const raw = await store().get(roomKey(roomId));
    const parsed = raw === null ? null : roomSchema.safeParse(safeJson(raw));
    if (!parsed?.success || parsed.data.expiresAt <= now()) {
      throw new RequestError(404, 'ルームが見つかりません。期限が切れたか、閉じられました。');
    }
    return parsed.data;
  }

  const ttlFor = (expiresAt: number) => Math.max(1, Math.ceil((expiresAt - now()) / 1000));

  /** Adds a member unless the room is full; the check and the write are one step. */
  async function addMember(roomId: string, expiresAt: number, name: string) {
    const memberId = createToken(9);
    const memberToken = createToken();
    const added = await store().hSetCapped(
      membersKey(roomId),
      memberId,
      JSON.stringify({ tokenHash: hashToken(memberToken), name }),
      ROOM_MEMBERS_MAX,
      expiresAt,
    );
    if (!added) throw new RequestError(409, `参加できるのは ${ROOM_MEMBERS_MAX} 人までです。`);
    return { memberId, memberToken };
  }

  /** The member a bearer token belongs to, within the member's polling limit. */
  async function authenticate(roomId: string, token: string) {
    const room = await loadRoom(roomId);
    const hash = hashToken(token);
    const members = await store().hGetAll(membersKey(roomId));
    for (const [memberId, raw] of Object.entries(members)) {
      const member = memberSchema.safeParse(safeJson(raw));
      if (member.success && secretsEqual(hash, member.data.tokenHash)) {
        if (!(await withinLimit(store(), `room-member:${roomId}:${memberId}`, ROOM_LIMITS.pollPerMember, now()))) {
          throw new RequestError(429, '更新が多すぎます。');
        }
        return { room, memberId, members };
      }
    }
    throw new RequestError(401, 'このルームの参加者として確認できませんでした。');
  }

  async function view(roomId: string, expiresAt: number, members: Record<string, string>): Promise<RoomView> {
    const positions = await store().hGetAll(positionsKey(roomId));
    return {
      expiresAt: new Date(expiresAt).toISOString(),
      members: Object.entries(members).flatMap(([memberId, raw]) => {
        const member = memberSchema.safeParse(safeJson(raw));
        if (!member.success) return [];
        const position = positions[memberId] ? storedPositionSchema.safeParse(safeJson(positions[memberId])) : null;
        return [{ memberId, name: member.data.name, position: position?.success ? position.data : null }];
      }),
    };
  }

  return {
    async create(fields: { passphrase: string; name: string; hours: number }): Promise<Membership> {
      if (!(await withinLimit(store(), 'create:rooms', ROOM_LIMITS.roomsPerDay, now()))) {
        throw new RequestError(429, '本日のルーム作成数の上限に達しました。明日お試しください。');
      }
      const roomId = createToken(16);
      const expiresAt = now() + fields.hours * 60 * 60 * 1000;
      // Counting and claiming a place are one step, so concurrent creations cannot pass the limit.
      if (!(await store().zAddCapped(ACTIVE_ROOMS_KEY, expiresAt, roomId, ROOM_LIMITS.activeRooms, now()))) {
        throw new RequestError(503, 'ただいま混み合っています。しばらくしてからお試しください。');
      }
      const { memberId, memberToken } = await addMember(roomId, expiresAt, fields.name);
      await store().set(
        roomKey(roomId),
        JSON.stringify({ passphraseHash: await hashPassphrase(fields.passphrase), expiresAt, hostMemberId: memberId }),
        { ttlSeconds: ttlFor(expiresAt) },
      );
      return { roomId, memberId, memberToken, host: true, expiresAt: new Date(expiresAt).toISOString() };
    },

    async join(roomId: string, fields: { passphrase: string; name: string }, clientIp: string): Promise<Membership> {
      const perAddress = await withinLimit(
        store(),
        `room-join:${roomId}:${hashToken(clientIp)}`,
        ROOM_LIMITS.joinPerAddress,
        now(),
      );
      const perRoom = perAddress && (await withinLimit(store(), `room-join:${roomId}`, ROOM_LIMITS.joinPerRoom, now()));
      if (!perAddress || !perRoom) throw new RequestError(429, '試行が多すぎます。しばらくしてからお試しください。');
      const room = await loadRoom(roomId);
      if (!(await verifyPassphrase(fields.passphrase, room.passphraseHash))) {
        throw new RequestError(403, '合言葉が違います。');
      }
      const { memberId, memberToken } = await addMember(roomId, room.expiresAt, fields.name);
      return { roomId, memberId, memberToken, host: false, expiresAt: new Date(room.expiresAt).toISOString() };
    },

    /**
     * Replaces the member's position (no earlier position is kept) and answers with the room, so a
     * sharing member makes one request per update instead of two.
     */
    async report(roomId: string, token: string, position: { latitude: number; longitude: number; accuracy: number }) {
      const { room, memberId, members } = await authenticate(roomId, token);
      await store().hSetUntil(
        positionsKey(roomId),
        memberId,
        JSON.stringify({ ...position, at: now() }),
        room.expiresAt,
      );
      return view(roomId, room.expiresAt, members);
    },

    async view(roomId: string, token: string): Promise<RoomView> {
      const { room, members } = await authenticate(roomId, token);
      return view(roomId, room.expiresAt, members);
    },

    /** A member leaves: their name and position are deleted at once. */
    async leave(roomId: string, token: string) {
      const { memberId } = await authenticate(roomId, token);
      await store().hDel(membersKey(roomId), memberId);
      await store().hDel(positionsKey(roomId), memberId);
    },

    /** The host closes the room: everything in it is deleted at once. */
    async close(roomId: string, token: string) {
      const { room, memberId } = await authenticate(roomId, token);
      if (memberId !== room.hostMemberId) throw new RequestError(403, 'ルームを閉じられるのは作成した人だけです。');
      await store().del(roomKey(roomId), membersKey(roomId), positionsKey(roomId));
      await store().zRem(ACTIVE_ROOMS_KEY, roomId);
    },
  };
}

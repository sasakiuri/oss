/**
 * Sharing positions in a temporary room (for a drive hunt and the like). Only each member's latest
 * position is kept, never a track, and the room with everything in it expires on its own.
 */

import { distanceKm } from './bear-alerts';

export const ROOM_HOURS_OPTIONS = [2, 4, 8, 12, 24] as const;
export const ROOM_MEMBERS_MAX = 30;
export const MEMBER_NAME_MAX_LENGTH = 20;
export const PASSPHRASE_MIN_LENGTH = 6;
export const PASSPHRASE_MAX_LENGTH = 64;
/** How often a member's page sends its position and reads the others'. */
export const POLL_INTERVAL_MS = 5_000;
/** A position older than this is shown as stale. */
export const STALE_AFTER_MS = 2 * 60_000;

export interface MemberPosition {
  latitude: number;
  longitude: number;
  /** Radius of the 95 % circle the browser reports, in metres. */
  accuracy: number;
  /** Milliseconds since the epoch, stamped by the server when the position arrived. */
  at: number;
}

/** Distance in metres and the initial bearing in degrees clockwise from true north. */
export function distanceAndBearing(from: MemberPosition, to: MemberPosition): { metres: number; degrees: number } {
  const metres = distanceKm(from, to) * 1000;
  const φ1 = (from.latitude * Math.PI) / 180;
  const φ2 = (to.latitude * Math.PI) / 180;
  const Δλ = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const degrees = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { metres, degrees };
}

const COMPASS = {
  ja: ['北', '北東', '東', '南東', '南', '南西', '西', '北西'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
} as const;

/** The nearest of the eight compass points. */
export function compassPoint(degrees: number, language: 'ja' | 'en'): string {
  return COMPASS[language][Math.round(degrees / 45) % 8] ?? COMPASS[language][0];
}

/** The invitation link's fragment; the passphrase is given separately, never in the link. */
export const roomFragment = (roomId: string) => `#room=${roomId}`;

export function readRoomFragment(hash: string): string | null {
  return /^#room=([A-Za-z0-9_-]{22})$/.exec(hash)?.[1] ?? null;
}

export const isStale = (position: MemberPosition, nowMs: number) => nowMs - position.at > STALE_AFTER_MS;

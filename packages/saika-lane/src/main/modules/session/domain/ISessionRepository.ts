// SPDX-License-Identifier: MIT
import { Session } from '@/main/modules/session/domain/Session';
import { Shot } from '@/main/modules/session/domain/Shot';

export interface ISessionRepository {
  /** Saves session metadata and all shots. */
  save(session: Session): Promise<void>;

  /** Saves an empty reset session and a new reset epoch in one durable transaction. */
  saveReset(session: Session): Promise<void>;

  /** Returns the last committed reset epoch, or null when this session has never been reset. */
  readResetEpoch(sessionId: string): Promise<string | null>;

  /** Saves session metadata and the new shot. Other shots remain unchanged. */
  saveShot(session: Session, shot: Shot): Promise<void>;

  findById(id: string): Promise<Session | null>;

  findAll(): Promise<Session[]>;

  delete(id: string): Promise<void>;

  findActive(): Promise<Session | null>;
}

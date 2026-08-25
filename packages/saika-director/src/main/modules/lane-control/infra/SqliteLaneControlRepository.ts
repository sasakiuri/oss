import type Database from 'better-sqlite3';
import { LaneControl } from '../domain/LaneControl';
import type { LaneControlSnapshot } from '../domain/LaneControl';
import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('SqliteLaneControlRepository');

export class SqliteLaneControlRepository implements ILaneControlRepository {
  private cache = new Map<string, LaneControl>();
  private dirty = new Set<string>();
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly db: Database.Database) {
    this.loadFromDb();
    this.flushInterval = setInterval(() => {
      try {
        this.flush();
      } catch (error) {
        logger.logError('Periodic lane state flush failed', error);
      }
    }, 5000);
  }

  // ---------------------------------------------------------------------------
  // Read operations (from cache)
  // ---------------------------------------------------------------------------

  findById(id: string): LaneControl | undefined {
    return this.cache.get(id);
  }

  findByChannel(channel: number): LaneControl | undefined {
    for (const lane of this.cache.values()) {
      if (lane.channel.value === channel) {
        return lane;
      }
    }
    return undefined;
  }

  findAll(): LaneControl[] {
    return [...this.cache.values()];
  }

  findActive(): LaneControl[] {
    return [...this.cache.values()].filter((lane) => lane.phase !== 'IDLE' && lane.phase !== 'FINISHED');
  }

  // ---------------------------------------------------------------------------
  // Write operations (cache + dirty mark)
  // ---------------------------------------------------------------------------

  save(laneControl: LaneControl): void {
    this.cache.set(laneControl.id, laneControl);
    this.dirty.add(laneControl.id);
  }

  delete(id: string): void {
    this.cache.delete(id);
    this.dirty.delete(id);
    this.db.prepare('DELETE FROM lane_state WHERE id = ?').run(id);
  }

  // ---------------------------------------------------------------------------
  // Flush / Lifecycle
  // ---------------------------------------------------------------------------

  flush(): void {
    if (this.dirty.size === 0) return;

    const upsert = this.db.prepare(`
      INSERT OR REPLACE INTO lane_state (id, channel, state_json, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `);

    const transaction = this.db.transaction(() => {
      for (const id of this.dirty) {
        const lane = this.cache.get(id);
        if (lane) {
          const snapshot = lane.toSnapshot();
          upsert.run(snapshot.id, snapshot.channel, JSON.stringify(snapshot));
        }
      }
    });
    transaction();
    this.dirty.clear();
  }

  close(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  private loadFromDb(): void {
    const rows = this.db.prepare('SELECT id, channel, state_json FROM lane_state').all() as {
      id: string;
      channel: number;
      state_json: string;
    }[];

    for (const row of rows) {
      try {
        const snapshot: LaneControlSnapshot = JSON.parse(row.state_json);
        const lane = LaneControl.fromSnapshot(snapshot);
        this.cache.set(lane.id, lane);
      } catch (error) {
        logger.logError(`Ignoring invalid persisted lane state: ${row.id}`, error);
      }
    }
  }
}

import type { FinalShootoff } from '../domain/FinalShootoff';
import type { IShootoffRepository } from '../domain/IShootoffRepository';

export class InMemoryShootoffRepository implements IShootoffRepository {
  private shootoffs = new Map<string, FinalShootoff>();
  private eventIndex = new Map<string, Set<string>>(); // eventId -> shootoffIds

  save(shootoff: FinalShootoff): void {
    this.shootoffs.set(shootoff.id.value, shootoff);
  }

  saveWithEventId(shootoff: FinalShootoff, eventId: string): void {
    this.shootoffs.set(shootoff.id.value, shootoff);

    if (!this.eventIndex.has(eventId)) {
      this.eventIndex.set(eventId, new Set());
    }
    this.eventIndex.get(eventId)!.add(shootoff.id.value);
  }

  findById(id: string): FinalShootoff | undefined {
    return this.shootoffs.get(id);
  }

  findByEventId(eventId: string): FinalShootoff[] {
    const shootoffIds = this.eventIndex.get(eventId);
    if (!shootoffIds) return [];

    const result: FinalShootoff[] = [];
    for (const shootoffId of shootoffIds) {
      const shootoff = this.shootoffs.get(shootoffId);
      if (shootoff) {
        result.push(shootoff);
      }
    }
    return result;
  }

  findActiveByEventId(eventId: string): FinalShootoff | undefined {
    return this.findByEventId(eventId).find((shootoff) => !shootoff.isResolved);
  }

  delete(id: string): void {
    this.shootoffs.delete(id);
    for (const shootoffIds of this.eventIndex.values()) {
      shootoffIds.delete(id);
    }
  }

  clearByEventId(eventId: string): void {
    const shootoffIds = this.eventIndex.get(eventId);
    if (shootoffIds) {
      for (const shootoffId of shootoffIds) {
        this.shootoffs.delete(shootoffId);
      }
      this.eventIndex.delete(eventId);
    }
  }
}

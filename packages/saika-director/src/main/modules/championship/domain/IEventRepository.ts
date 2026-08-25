import type { Event } from './Event';

export interface IEventRepository {
  save(event: Event): void;
  update(event: Event): void;
  findById(id: string): Event | null;
  findByChampionshipId(championshipId: string): Event[];
  delete(id: string): void;
  deleteByChampionshipId(championshipId: string): void;
  executeInTransaction(fn: () => void): void;
}

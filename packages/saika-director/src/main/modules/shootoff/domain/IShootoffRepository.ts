import type { FinalShootoff } from './FinalShootoff';

export interface IShootoffRepository {
  save(shootoff: FinalShootoff): void;

  saveWithEventId(shootoff: FinalShootoff, eventId: string): void;

  findById(id: string): FinalShootoff | undefined;

  findByEventId(eventId: string): FinalShootoff[];

  delete(id: string): void;
}

import type { Championship } from './Championship';

export interface IChampionshipRepository {
  save(championship: Championship): void;
  update(championship: Championship): void;
  findById(id: string): Championship | null;
  findAll(): Championship[];
  delete(id: string): void;
}

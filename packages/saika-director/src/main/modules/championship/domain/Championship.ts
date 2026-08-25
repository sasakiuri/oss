import { ChampionshipId } from './ChampionshipId';
import { ChampionshipInfo } from './ChampionshipInfo';

export class Championship {
  private constructor(
    public readonly id: ChampionshipId,
    public readonly info: ChampionshipInfo,
    public readonly createdAt: Date,
  ) {}

  static create(id: ChampionshipId, info: ChampionshipInfo): Championship {
    return new Championship(id, info, new Date());
  }

  static reconstruct(id: ChampionshipId, info: ChampionshipInfo, createdAt: Date): Championship {
    return new Championship(id, info, createdAt);
  }

  updateInfo(info: ChampionshipInfo): Championship {
    return new Championship(this.id, info, this.createdAt);
  }
}

export class ChampionshipInfo {
  private constructor(
    public readonly name: string,
    public readonly date: string,
    public readonly venue: string,
  ) {}

  static create(name: string, date: string, venue: string): ChampionshipInfo {
    if (!name.trim()) {
      throw new Error('Championship name cannot be empty');
    }
    return new ChampionshipInfo(name.trim(), date, venue.trim());
  }
}

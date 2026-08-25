export class Player {
  private constructor(
    public readonly name: string,
    public readonly affiliation: string,
    public readonly participantId?: string,
    public readonly logoPath?: string,
  ) {}

  static create(name: string, affiliation: string, participantId?: string, logoPath?: string): Player {
    if (!name.trim()) {
      throw new Error('Player name cannot be empty');
    }
    return new Player(name.trim(), affiliation.trim(), participantId, logoPath);
  }
}

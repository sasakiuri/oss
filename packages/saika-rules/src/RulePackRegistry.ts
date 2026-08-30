import type { RulePack } from './RulePack';

export class RulePackRegistry {
  private readonly packsById = new Map<string, RulePack>();

  constructor(packs: readonly RulePack[] = []) {
    for (const pack of packs) this.register(pack);
  }

  register(pack: RulePack): void {
    if (this.packsById.has(pack.id)) throw new Error(`Rule Pack "${pack.id}" is already registered`);
    this.packsById.set(pack.id, pack);
  }

  getById(id: string): RulePack {
    const pack = this.packsById.get(id);
    if (!pack) throw new Error(`Rule Pack "${id}" is not registered`);
    return pack;
  }

  findForEvent(eventCode: string, effectiveOn: string): RulePack | null {
    const candidates = [...this.packsById.values()]
      .filter(
        (pack) =>
          pack.eventCode === eventCode &&
          pack.authority.effectiveFrom <= effectiveOn &&
          (pack.authority.effectiveUntil === undefined || effectiveOn <= pack.authority.effectiveUntil),
      )
      .sort((left, right) => right.authority.effectiveFrom.localeCompare(left.authority.effectiveFrom));
    return candidates[0] ?? null;
  }

  getAll(): RulePack[] {
    return [...this.packsById.values()];
  }
}

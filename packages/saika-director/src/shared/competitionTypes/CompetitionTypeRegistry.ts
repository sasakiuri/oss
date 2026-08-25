import type { CompetitionTypeDefinition } from './CompetitionTypeDefinition';
import type { CompetitionTypeStrategy } from './CompetitionTypeStrategy';

/**
 * Instance-based competition type registry.
 *
 * Process initialization:
 * - Main registers built-ins at startup.
 * - Renderer obtains the type list from main over IPC.
 * - Preload does not depend on the registry.
 */
export class CompetitionTypeRegistry {
  private readonly definitions = new Map<string, CompetitionTypeDefinition>();
  private readonly strategies = new Map<string, CompetitionTypeStrategy>();

  register(def: CompetitionTypeDefinition): void {
    if (this.definitions.has(def.id)) {
      throw new Error(`Competition type "${def.id}" is already registered.`);
    }
    this.definitions.set(def.id, def);
  }

  registerStrategy(strategy: CompetitionTypeStrategy): void {
    if (this.strategies.has(strategy.id)) {
      throw new Error(`Strategy "${strategy.id}" is already registered.`);
    }
    this.strategies.set(strategy.id, strategy);
  }

  get(id: string): CompetitionTypeDefinition {
    const def = this.definitions.get(id);
    if (!def) {
      throw new Error(`Competition type "${id}" is not registered.`);
    }
    return def;
  }

  getStrategy(strategyId: string): CompetitionTypeStrategy {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy "${strategyId}" is not registered.`);
    }
    return strategy;
  }

  getStrategyFor(def: CompetitionTypeDefinition): CompetitionTypeStrategy {
    return this.getStrategy(def.rankingStrategyId);
  }

  getAll(): CompetitionTypeDefinition[] {
    return Array.from(this.definitions.values());
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  /** Resets the registry for tests. */
  _reset(): void {
    this.definitions.clear();
    this.strategies.clear();
  }
}

/** Default shared instance. */
export const competitionTypeRegistry = new CompetitionTypeRegistry();

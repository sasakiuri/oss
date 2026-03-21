// SPDX-License-Identifier: MIT
import type { CompetitionTypeDefinition } from './CompetitionTypeDefinition';

/**
 * CompetitionTypeRegistry — competition type registry
 *
 * A simple registry for registering and retrieving competition type definitions.
 */
export class CompetitionTypeRegistry {
  private readonly types = new Map<string, CompetitionTypeDefinition>();

  /**
   * Registers a competition type
   *
   * @param definition - Competition type definition
   */
  register(definition: CompetitionTypeDefinition): void {
    this.types.set(definition.id, definition);
  }

  /**
   * Retrieves a competition type by ID
   *
   * @param id - Competition type ID
   * @returns Competition type definition, or undefined if not registered
   */
  get(id: string): CompetitionTypeDefinition | undefined {
    return this.types.get(id);
  }

  /**
   * Retrieves all competition types
   *
   * @returns All registered competition type definitions
   */
  getAll(): CompetitionTypeDefinition[] {
    return Array.from(this.types.values());
  }
}

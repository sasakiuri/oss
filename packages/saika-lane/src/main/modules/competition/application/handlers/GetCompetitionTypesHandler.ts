// SPDX-License-Identifier: MIT
import type { CompetitionTypeRegistry } from '@/main/modules/competition/domain/CompetitionTypeRegistry';
import type { QueryHandler } from '@/main/shared-infra/cqrs';

import type { CompetitionTypeDto } from '../dto';

/**
 * createGetCompetitionTypesHandler
 *
 * Query handler factory for retrieving all registered competition types.
 * Converts CompetitionTypeDefinition → CompetitionTypeDto[] and returns it.
 */
export function createGetCompetitionTypesHandler(
  registry: CompetitionTypeRegistry,
): QueryHandler<void, CompetitionTypeDto[]> {
  return async () => {
    return registry.getAll().map((def) => ({
      id: def.id,
      name: def.name,
    }));
  };
}

// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { createGetCompetitionTypesHandler } from '@/main/modules/competition/application/handlers/GetCompetitionTypesHandler';
import { CompetitionTypeRegistry } from '@/main/modules/competition/domain/CompetitionTypeRegistry';
import { AR60, BP60, BR60S } from '@/main/modules/competition/domain/competitionTypes';

describe('createGetCompetitionTypesHandler', () => {
  it('returns registered competition types in DTO format', async () => {
    const registry = new CompetitionTypeRegistry();
    registry.register(AR60);
    registry.register(BR60S);
    registry.register(BP60);

    const handler = createGetCompetitionTypesHandler(registry);
    const result = await handler();

    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ id: 'AR60', name: '10m Air Rifle 60 shots' });
    expect(result).toContainEqual({ id: 'BR60S', name: '10m Beam Rifle 60 shots standing' });
    expect(result).toContainEqual({ id: 'BP60', name: '10m Beam Pistol 60 shots' });
  });

  it('returns empty array for empty registry', async () => {
    const registry = new CompetitionTypeRegistry();

    const handler = createGetCompetitionTypesHandler(registry);
    const result = await handler();

    expect(result).toEqual([]);
  });

  it('DTO contains only id and name', async () => {
    const registry = new CompetitionTypeRegistry();
    registry.register(BR60S);

    const handler = createGetCompetitionTypesHandler(registry);
    const result = await handler();

    expect(Object.keys(result[0]!)).toEqual(['id', 'name']);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { ISSF_2026_AR60, RulePackRegistry } from '@sasakiuri/saika-rules';

import { RulePackResultPublicationPolicyResolver } from '@/main/modules/result-publication';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';

describe('RulePackResultPublicationPolicyResolver', () => {
  it('uses the Rule Pack pinned by the event competition definition', async () => {
    const queryBus = {
      execute: vi.fn(async () => ({ eventType: 'AR60' })),
    } as unknown as QueryBus;
    const competitionTypes = new CompetitionTypeRegistry();
    competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_AR60));
    const resolver = new RulePackResultPublicationPolicyResolver(
      queryBus,
      competitionTypes,
      new RulePackRegistry([ISSF_2026_AR60]),
      { scoreProtestWindowMs: 1 },
    );

    await expect(resolver.resolve('event-1', 'QUALIFICATION')).resolves.toEqual({
      scoreProtestWindowMs: 600_000,
    });
  });

  it('keeps local competition definitions on an injected fallback policy', async () => {
    const queryBus = {
      execute: vi.fn(async () => ({ eventType: 'BR60S' })),
    } as unknown as QueryBus;
    const competitionTypes = new CompetitionTypeRegistry();
    competitionTypes.register(BR60S);
    const resolver = new RulePackResultPublicationPolicyResolver(queryBus, competitionTypes, new RulePackRegistry(), {
      scoreProtestWindowMs: 300_000,
    });

    await expect(resolver.resolve('event-1', 'QUALIFICATION')).resolves.toEqual({
      scoreProtestWindowMs: 300_000,
    });
  });
});

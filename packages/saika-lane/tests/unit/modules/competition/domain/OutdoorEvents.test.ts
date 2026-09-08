import {
  ISSF_2026_300M_RIFLE_RULE_PACKS,
  ISSF_2026_50M_PISTOL_RULE_PACKS,
  identifyRulePack,
} from '@sasakiuri/saika-rules';
import { describe, expect, it } from 'vitest';

import { ALL_COMPETITION_TYPES } from '@/main/modules/competition/domain/competitionTypes';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { SessionStorageSchema } from '@/main/modules/session/infra/SessionStorageSchema';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';
import { TargetDevice } from '@/main/modules/target/domain/TargetDevice';
import { getTargetZoneConfig } from '@/renderer/presentation/components/target/targetColors';
import { settingsContract } from '@/shared/ipc/contracts/settings.contract';

describe('outdoor event integration', () => {
  it.each([...ISSF_2026_300M_RIFLE_RULE_PACKS, ...ISSF_2026_50M_PISTOL_RULE_PACKS])(
    'selects, saves and restores $eventCode with its exact rules identity',
    (pack) => {
      const definition = ALL_COMPETITION_TYPES.find((item) => item.id === pack.eventCode)!;
      expect(definition.rulePackIdentity).toEqual(identifyRulePack(pack));
      expect(definition.config.acc).toBe('RING');
      const preferences = settingsContract.procedures.saveUserPreferences.input.parse({
        preferences: { discipline: definition.discipline, competitionTypeId: definition.id },
      });
      expect(preferences.preferences.discipline).toBe(pack.discipline);
      const restored = SessionStorageSchema.parse(
        JSON.parse(
          JSON.stringify({
            id: 'saved-session',
            discipline: pack.discipline,
            mode: 'MATCH',
            series: [],
            allShots: [],
            startedAt: '2026-09-08T00:00:00Z',
            finishedAt: null,
            scoringMode: 'RING',
          }),
        ),
      );
      expect(Discipline.fromValue(restored.discipline).value).toBe(pack.discipline);
      expect(TargetDevice.fromId('CUSTOM').supportedDisciplines.some((item) => item.value === pack.discipline)).toBe(
        true,
      );
    },
  );

  it.each([
    [Discipline.rifle300m(), 54, 29, 504, 5],
    [Discipline.pistol50m(), 27.8, 15.3, 252.8, 7],
  ] as const)('scores the gauged ring and inner-ten boundaries for $0.value', (discipline, ten, inner, one, black) => {
    const design = TargetDesign.forDiscipline(discipline);
    expect(design.calculateScore(new ImpactPoint(ten, 0)).value).toBe(100);
    expect(design.calculateScore(new ImpactPoint(ten + 0.001, 0)).value).toBeLessThan(100);
    expect(design.isInnerTen(new ImpactPoint(inner, 0))).toBe(true);
    expect(design.isInnerTen(new ImpactPoint(inner + 0.001, 0))).toBe(false);
    expect(design.calculateScore(new ImpactPoint(one, 0)).value).toBe(10);
    expect(design.calculateScore(new ImpactPoint(one + 0.001, 0)).value).toBe(0);
    expect(getTargetZoneConfig(discipline.value).innerZoneStartScore).toBe(black);
  });
});

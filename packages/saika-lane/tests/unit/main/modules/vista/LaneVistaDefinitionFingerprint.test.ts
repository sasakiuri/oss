// SPDX-License-Identifier: MIT
import { VISTA_EVENT_CODES } from '@sasakiuri/saika-protocol/Vista';
import { describe, expect, it, vi } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { ALL_COMPETITION_TYPES } from '@/main/modules/competition/domain/competitionTypes';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Session } from '@/main/modules/session/domain/Session';
import { laneVistaDefinition } from '@/main/modules/vista/application/LaneVistaProjection';
import { getTargetZoneConfig } from '@/renderer/presentation/components/target/targetColors';
import type { Discipline as DisciplineValue } from '@/shared/ipc/contracts';
import { getDefaultTargetScoringProfile } from '@/shared/target';

/**
 * Vista definition fingerprints released with Lane. A spectator compares them across sources, so the
 * canonical JSON behind them must keep producing the same bytes.
 */
const RELEASED_FINGERPRINTS: Record<(typeof VISTA_EVENT_CODES)[number], string> = {
  AR60: 'a5eb4f63dccdf9f083a8a37c386445d7725ac16f32f0361d273766c833b3b93c',
  AP60: '43bacaad43f9e396af05ac9e056cac0ce4823a622d001691df24b03597066aca',
  BR60S: 'f5c141660e527fb2f07aba31bcc94eee473f39626d36fb88fceadd15e47b530d',
  BP60: '9e29db910fa12458f1bc3eea63155e7c6156954e90f260f81ef57491bed60e02',
  AR60_FINAL: 'cf7d9714946f3c72f5c80714264b5428e9720124d6138ea805ca22dc828ae7bc',
  AP60_FINAL: '90ca0de36da104d34faad39fd27cdeb8c6afa4046f80299b564bdeed5f173e78',
  BR60S_FINAL: '985e9053ccfd598ff845c784038b482afb45e1df5b66c8407b604aa620544f85',
  BP60_FINAL: '00970efeb28a2e8d57f50cda784389ab8ea5e695527a1aa784fb80deb570da12',
};

function definitionFor(eventCode: string) {
  const standard = ALL_COMPETITION_TYPES.find((candidate) => candidate.id === eventCode)!;
  const session = Session.create(Discipline.fromValue(standard.discipline));
  return laneVistaDefinition(CompetitionState.create('competition', session.id, standard.config), session);
}

describe('Lane Vista definition fingerprints', () => {
  it.each(VISTA_EVENT_CODES)('keeps the released fingerprint of %s', (eventCode) => {
    expect(definitionFor(eventCode)?.fingerprint).toBe(RELEASED_FINGERPRINTS[eventCode]);
  });

  it.each(VISTA_EVENT_CODES)('keeps the released fingerprint of %s under any locale collation', (eventCode) => {
    const compare = String.prototype.localeCompare;
    // A collation that orders every pair the other way round stands in for any locale that reorders keys.
    const reversed = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (
      this: string,
      that: string,
    ) {
      return -compare.call(this, that);
    });
    try {
      expect('a'.localeCompare('b')).toBeGreaterThan(0);
      expect(definitionFor(eventCode)?.fingerprint).toBe(RELEASED_FINGERPRINTS[eventCode]);
    } finally {
      reversed.mockRestore();
    }
  });

  // The Vista definition encodes the black zone as "ring 4 for rifles, ring 7 for pistols"; the Lane target
  // renderer keeps its own table. Both describe the same face, and the Vista value feeds the fingerprint.
  it.each(VISTA_EVENT_CODES)('gives %s the black zone the Lane target renderer draws', (eventCode) => {
    const discipline = ALL_COMPETITION_TYPES.find((candidate) => candidate.id === eventCode)!
      .discipline as DisciplineValue;
    const innerZoneRing = getDefaultTargetScoringProfile(discipline).ringLines.find(
      (ring) => ring.score === getTargetZoneConfig(discipline).innerZoneStartScore,
    )!;
    expect(definitionFor(eventCode)?.target.blackDiameter).toBe(innerZoneRing.radiusMm * 2);
  });

  it('publishes no definition for a standard event outside the supported list', () => {
    const unsupported = ALL_COMPETITION_TYPES.find(
      (candidate) => !(VISTA_EVENT_CODES as readonly string[]).includes(candidate.id),
    )!;
    expect(definitionFor(unsupported.id)).toBeNull();
  });
});

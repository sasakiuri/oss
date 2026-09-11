// SPDX-License-Identifier: MIT
import { buildIssf10mFinalCommandScript } from '../issf-2026/finalCommandScript';
import { defineRulePack, type RulePack } from '../RulePack';

/**
 * JRSF domestic rules 6.17.5-2 / 6.17.5-3 adopt the corresponding 10m air Final procedure.
 * This is a JRSF definition with Beam geometry, not an ISSF event or adjudication policy.
 * Sources: https://www.riflesports.jp/wp-content/uploads/2026/01/2026_ALL.pdf
 * Effective date: https://www.riflesports.jp/2026/02/10093/
 */
function beamFinal(eventCode: 'BR60S_FINAL' | 'BP60_FINAL'): RulePack {
  const rifle = eventCode === 'BR60S_FINAL';
  const domesticReference = `JRSF 2026 ${rifle ? '6.17.5-2' : '6.17.5-3'}`;
  const adoptedReference = (reference: string) => `${domesticReference}; adopted ISSF ${reference}`;
  const script = buildIssf10mFinalCommandScript({
    idPrefix: `jrsf.2026.${eventCode.toLowerCase()}`,
    callToLineLeadSeconds: 600,
    takePositionsLeadSeconds: rifle ? 395 : 375,
    stages: [
      { stageId: 'FIRST_STAGE', stageIndex: 1, shotsPerSeries: 5, seriesCount: 2, durationSeconds: 250 },
      {
        stageId: 'ELIMINATION_STAGE',
        stageIndex: 2,
        shotsPerSeries: 1,
        seriesCount: 14,
        durationSeconds: 50,
        checkpointEverySeries: 2,
      },
    ],
    ruleReferences: {
      reporting: adoptedReference('6.17.1.3'),
      callToLine: adoptedReference('6.17.1.14(c)'),
      preparation: adoptedReference('6.17.2(d)'),
      multiShot: adoptedReference('6.17.2(e)'),
      singleShot: adoptedReference('6.17.2(f)'),
      checkpoint: adoptedReference('6.17.2(g)-(h)'),
      completion: adoptedReference('6.17.2(i)'),
      shootOff: adoptedReference('6.17.2(h)'),
    },
  });
  return defineRulePack({
    schemaVersion: 1,
    id: `JRSF:2026:${eventCode}:FINAL`,
    eventCode,
    displayName: `10m Beam ${rifle ? 'Rifle' : 'Pistol'} Final (JRSF 2026)`,
    discipline: rifle ? 'BEAM_RIFLE_10M' : 'BEAM_PISTOL_10M',
    round: 'FINAL',
    authority: {
      organization: 'JRSF',
      edition: '2026-04-01',
      effectiveFrom: '2026-04-01',
      ruleReferences: [domesticReference, 'ISSF 6.17.2 (adopted Final procedure)'],
    },
    capabilities: {
      target: {
        scoringProfileId: rifle ? 'JRSF_BEAM_RIFLE_10M' : 'JRSF_BEAM_PISTOL_10M',
        scoringGaugeProfileId: rifle ? 'JRSF_BEAM_RIFLE_VIRTUAL_6_00' : 'JRSF_BEAM_PISTOL_VIRTUAL_4_50',
      },
      scoring: { mode: 'DECIMAL', minimumShotScore: 0, maximumSeriesScore: 109, precision: 1 },
      courseOfFire: {
        hasRelays: false,
        minimumParticipants: 2,
        maximumParticipants: 8,
        stages: [
          {
            id: 'PREPARATION',
            name: 'Preparation and sighting',
            phase: 'PREPARATION',
            series: [{ shots: 0 }],
            timer: { mode: 'stage', durationSeconds: 300 },
            requiresNewSession: false,
          },
          {
            id: 'FIRST_STAGE',
            name: '1st Stage',
            phase: 'MATCH',
            series: [{ shots: 5 }, { shots: 5 }],
            timer: { mode: 'series', durationSeconds: 250 },
            requiresNewSession: true,
            seriesTransition: 'OFFICIAL_COMMAND',
          },
          {
            id: 'ELIMINATION_STAGE',
            name: '2nd Stage',
            phase: 'MATCH',
            series: Array.from({ length: 14 }, () => ({ shots: 1 })),
            timer: { mode: 'shot', durationSeconds: 50 },
            requiresNewSession: false,
            seriesTransition: 'OFFICIAL_COMMAND',
            elimination: {
              athletesPerCheckpoint: 1,
              checkpointUnit: 'series',
              checkpointEverySeries: 2,
              tieResolution: 'shoot-off',
            },
          },
        ],
      },
      ranking: {
        strategy: 'FINAL_SCORE',
        totalShots: 24,
        totalSeries: 16,
        stage1Shots: 10,
        finalRuleReference: domesticReference,
      },
      commands: {
        preparationAndSightingSeconds: 300,
        preparationWarningsAtRemainingSeconds: [30],
        matchWarningsAtRemainingSeconds: [],
        resetPauseSeconds: 60,
        finalScript: {
          ...script,
          version: 'JRSF-2026-beam-final-1',
          source: {
            organization: 'JRSF',
            title: `${domesticReference}: 10m Final procedure adopted from ISSF`,
            version: '2026-04-01; adopted ISSF February 2026 command sequence',
          },
        },
      },
    },
  });
}

export const JRSF_2026_BR60S_FINAL = beamFinal('BR60S_FINAL');
export const JRSF_2026_BP60_FINAL = beamFinal('BP60_FINAL');
export const JRSF_2026_RULE_PACKS = Object.freeze([JRSF_2026_BR60S_FINAL, JRSF_2026_BP60_FINAL]);

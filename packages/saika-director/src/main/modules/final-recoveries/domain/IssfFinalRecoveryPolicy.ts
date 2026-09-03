import type { FinalRecoveryGuidanceDto } from '@/shared/ipc/contracts';

import type { FinalRecoveryIncidentType, FinalRecoveryPhase, FinalRecoveryProcedureProfile } from './FinalRecoveryCase';

const emptyLimits: FinalRecoveryGuidanceDto['limits'] = {
  malfunctionAllowancePerFinal: null,
  repairLimitSeconds: null,
  readyLimitSeconds: null,
  incorrectCommandAdditionalSeconds: null,
  longDelayThresholdSeconds: null,
  sightingTimeSeconds: null,
};

export function getIssfFinalRecoveryGuidance(
  profile: FinalRecoveryProcedureProfile,
  incidentType: FinalRecoveryIncidentType,
  phase: FinalRecoveryPhase,
): FinalRecoveryGuidanceDto {
  switch (incidentType) {
    case 'MALFUNCTION':
      return malfunctionGuidance(profile, phase);
    case 'EST_FAILURE':
      return estGuidance(profile, phase);
    case 'INCORRECT_COMMAND':
      return incorrectCommandGuidance(phase);
    case 'IRREGULAR_CASE':
      return {
        ruleReferences: ['6.17.1.14(u)'],
        checklist: [
          'Preserve the observed facts and the current Final step before deciding an outcome.',
          'The Jury decides irregular or disputed matters under the applicable event rules.',
          'Record any scoring decision, Range Incident Report, or protest in its independent ledger.',
        ],
        classifications: ['OTHER'],
        remedies: ['NONE', 'CONTINUE', 'OTHER'],
        limits: { ...emptyLimits },
      };
  }
}

function malfunctionGuidance(
  profile: FinalRecoveryProcedureProfile,
  phase: FinalRecoveryPhase,
): FinalRecoveryGuidanceDto {
  if (profile === 'PISTOL_25M_RAPID_FIRE') {
    if (phase === 'SIGHTING') return sightingMalfunctionGuidance('6.17.4(o)');
    return {
      ruleReferences: ['6.17.4(o)', '6.13.2', '6.13.8'],
      checklist: [
        'A Range Officer determines ALLOWABLE or NON-ALLOWABLE; sighting-series malfunctions cannot be claimed or refired.',
        'Check whether a malfunction has already been claimed in this Final.',
        'For the first ALLOWABLE claim, repeat the series while the other finalists stand by; NON-ALLOWABLE carries the rule penalty.',
        'Document the malfunction in the independent Range Incident Report or malfunction form.',
      ],
      classifications: ['ALLOWABLE_MALFUNCTION', 'NON_ALLOWABLE_MALFUNCTION', 'OTHER'],
      remedies: ['REPEAT_SERIES', 'COUNT_DISPLAYED_SHOTS', 'APPLY_RULE_PENALTY', 'CONTINUE', 'OTHER'],
      limits: { ...emptyLimits, malfunctionAllowancePerFinal: 1, readyLimitSeconds: 20 },
    };
  }
  if (profile === 'PISTOL_25M_WOMEN') {
    if (phase === 'SIGHTING') return sightingMalfunctionGuidance('6.17.5(k)');
    return {
      ruleReferences: ['6.17.5(k)', '6.13.2', '6.13.8'],
      checklist: [
        'A Range Officer determines ALLOWABLE or NON-ALLOWABLE; sighting-series malfunctions cannot be completed.',
        'Check whether a malfunction has already been claimed in this Final.',
        'For the first ALLOWABLE claim, complete the series while the other finalists stand by; further claims use displayed hits.',
        'Document the malfunction in the independent Range Incident Report or malfunction form.',
      ],
      classifications: ['ALLOWABLE_MALFUNCTION', 'NON_ALLOWABLE_MALFUNCTION', 'OTHER'],
      remedies: ['COMPLETE_SERIES', 'COUNT_DISPLAYED_SHOTS', 'CONTINUE', 'OTHER'],
      limits: { ...emptyLimits, malfunctionAllowancePerFinal: 1, readyLimitSeconds: 15 },
    };
  }

  const isSeries = phase === 'MATCH_SERIES';
  const mixedTeam = profile === 'RIFLE_PISTOL_10M_50M_MIXED_TEAM';
  return {
    ruleReferences:
      profile === 'GENERAL'
        ? ['6.17.1.14(r)', '6.13.2', '6.13.8']
        : mixedTeam
          ? ['6.17.1.6', '6.18.1.8', '6.13.2', '6.13.8']
          : ['6.17.1.6', '6.13.2', '6.13.8'],
    checklist: [
      'Determine ALLOWABLE or NON-ALLOWABLE without changing the original shot record.',
      mixedTeam
        ? 'Check whether the team has already used its one ALLOWABLE malfunction in this Final.'
        : 'Check whether the athlete has already used the one ALLOWABLE malfunction in this Final.',
      isSeries
        ? 'Preserve fired shots and record the remaining time when the malfunction was claimed.'
        : 'For an ALLOWABLE single-shot malfunction, direct the athlete to repeat the shot after repair or replacement.',
      'Document the malfunction in the independent Range Incident Report or malfunction form.',
    ],
    classifications: ['ALLOWABLE_MALFUNCTION', 'NON_ALLOWABLE_MALFUNCTION'],
    remedies: isSeries
      ? ['COMPLETE_SERIES', 'COUNT_DISPLAYED_SHOTS', 'CONTINUE', 'OTHER']
      : ['REPEAT_SINGLE_SHOT', 'COUNT_DISPLAYED_SHOTS', 'CONTINUE', 'OTHER'],
    limits: { ...emptyLimits, malfunctionAllowancePerFinal: 1, repairLimitSeconds: 60 },
  };
}

function sightingMalfunctionGuidance(ruleReference: string): FinalRecoveryGuidanceDto {
  return {
    ruleReferences: [ruleReference, '8.9.1'],
    checklist: [
      'A malfunction during a sighting series may be recorded, but it may not be claimed or given a repeat/completion series.',
      'The athlete may clear the malfunction and continue only within the original sighting-series time.',
      'Keep any firearm examination or Range Incident Report in its independent record.',
    ],
    classifications: ['OTHER'],
    remedies: ['NONE', 'CONTINUE', 'OTHER'],
    limits: { ...emptyLimits, malfunctionAllowancePerFinal: 1 },
  };
}

function estGuidance(profile: FinalRecoveryProcedureProfile, phase: FinalRecoveryPhase): FinalRecoveryGuidanceDto {
  const sighting = phase === 'SIGHTING';
  const is10mOr50m = profile === 'RIFLE_PISTOL_10M_50M' || profile === 'RIFLE_PISTOL_10M_50M_MIXED_TEAM';
  const replacementRemedies =
    profile === 'PISTOL_25M_RAPID_FIRE'
      ? (['REPEAT_SERIES'] as const)
      : profile === 'PISTOL_25M_WOMEN'
        ? (['COMPLETE_SERIES'] as const)
        : (['REPEAT_SINGLE_SHOT'] as const);
  return {
    ruleReferences: sighting ? ['6.17.1.8(a)'] : ['6.17.1.8(b)', '6.17.1.8(c)', '6.17.1.8(d)'],
    checklist: sighting
      ? [
          'Direct one test shot at the same target.',
          'If it still does not register, command STOP…UNLOAD for all finalists and move the athlete to a reserve target.',
          'Give all finalists two minutes preparation time, then restart Preparation and Sighting Time.',
        ]
      : [
          'The Jury Member-in-Charge, a second Competition Jury Member, and one RTS determine miss versus target malfunction.',
          'Unless credible evidence establishes a miss, authorize the event-specific replacement shot or series.',
          'If the replacement does not register, move the athlete to a reserve target before completing the replacement.',
          is10mOr50m
            ? 'If the delay exceeds five minutes, give all 10m/50m finalists two minutes sighting time before resumption.'
            : 'Use the event-specific 25m procedure; the two-minute sighting provision in Rule 6.17.1.8(d) applies only to 10m/50m Finals.',
        ],
    classifications: sighting ? ['TARGET_MALFUNCTION', 'OTHER'] : ['TARGET_MALFUNCTION', 'SHOT_CONFIRMED_MISS'],
    remedies: sighting
      ? ['FIRE_TEST_SHOT', 'MOVE_TO_RESERVE_TARGET', 'RESTART_PREPARATION_AND_SIGHTING', 'CONTINUE', 'OTHER']
      : [
          ...replacementRemedies,
          'MOVE_TO_RESERVE_TARGET',
          ...(is10mOr50m ? (['GRANT_TWO_MINUTE_SIGHTING'] as const) : []),
          'CONTINUE',
          'OTHER',
        ],
    limits: {
      ...emptyLimits,
      longDelayThresholdSeconds: is10mOr50m ? 300 : null,
      sightingTimeSeconds: sighting || is10mOr50m ? 120 : null,
    },
  };
}

function incorrectCommandGuidance(phase: FinalRecoveryPhase): FinalRecoveryGuidanceDto {
  const multiShot = phase === 'MATCH_SERIES';
  return {
    ruleReferences: ['6.17.1.14(p)'],
    checklist: [
      'Count all shots already fired before correcting the command.',
      multiShot
        ? 'The Jury Member-in-Charge determines the remaining time; restart with that time plus 60 seconds.'
        : 'Reset the clock to the original time limit for athletes who did not start or complete firing.',
      'Nullify accidental extra shots caused by misunderstanding this correction without a penalty.',
      'Record the actual clock value, affected lanes, correction command, and resumption time.',
    ],
    classifications: ['COMMAND_CONFIRMED', 'COMMAND_NOT_CONFIRMED'],
    remedies: multiShot
      ? ['RESTART_WITH_REMAINING_TIME_PLUS_60', 'NULLIFY_EXTRA_SHOTS_WITHOUT_PENALTY', 'CONTINUE', 'OTHER']
      : ['RESET_TO_ORIGINAL_TIME', 'NULLIFY_EXTRA_SHOTS_WITHOUT_PENALTY', 'CONTINUE', 'OTHER'],
    limits: { ...emptyLimits, incorrectCommandAdditionalSeconds: multiShot ? 60 : null },
  };
}

import type {
  QualificationMalfunctionAllowableTreatment,
  QualificationMalfunctionCapability,
  QualificationMalfunctionCauseRule,
  QualificationMalfunctionClaimLimit,
} from '../QualificationMalfunction';

const generalCauses: readonly QualificationMalfunctionCauseRule[] = [
  cause('CARTRIDGE_FAILED_TO_FIRE', 'ALLOWABLE', 'Cartridge failed to fire', '6.13.2.1(a)'),
  cause('PROJECTILE_LODGED', 'ALLOWABLE', 'Bullet or pellet lodged in the barrel', '6.13.2.1(b)'),
  cause('TRIGGER_RELEASED_GUN_FAILED', 'ALLOWABLE', 'Gun failed after the trigger mechanism released', '6.13.2.1(c)'),
  cause('ACTION_OPENED', 'NON_ALLOWABLE', 'Athlete opened the action', '6.13.2.2(a)'),
  cause('SAFETY_ENGAGED', 'NON_ALLOWABLE', 'Safety was engaged', '6.13.2.2(b)'),
  cause('IMPROPERLY_LOADED', 'NON_ALLOWABLE', 'Gun was not properly loaded', '6.13.2.2(c)'),
  cause('TRIGGER_NOT_PULLED', 'NON_ALLOWABLE', 'Athlete did not pull the trigger', '6.13.2.2(d)'),
  cause(
    'ATHLETE_CORRECTABLE',
    'NON_ALLOWABLE',
    'Cause could reasonably have been corrected by the athlete',
    '6.13.2.2(e)',
  ),
  cause('ELECTRONIC_TRIGGER_BATTERY_FAILED', 'NON_ALLOWABLE', 'Electronic trigger battery failed', '6.13.2.2(f)'),
];

const pistol25mCauses: readonly QualificationMalfunctionCauseRule[] = [
  cause('PROJECTILE_LODGED', 'ALLOWABLE', 'Bullet lodged in the barrel', '8.9.4.1(a)'),
  cause('TRIGGER_MECHANISM_FAILED', 'ALLOWABLE', 'Trigger mechanism failed to operate', '8.9.4.1(b)'),
  cause(
    'UNDISCHARGED_CARTRIDGE_AFTER_TRIGGER',
    'ALLOWABLE',
    'Undischarged cartridge remained after the trigger operated',
    '8.9.4.1(c)',
  ),
  cause('CASE_NOT_EXTRACTED_OR_EJECTED', 'ALLOWABLE', 'Cartridge case was not extracted or ejected', '8.9.4.1(d)'),
  cause('JAMMED_COMPONENT', 'ALLOWABLE', 'Cartridge, magazine, cylinder, or pistol part jammed', '8.9.4.1(e)'),
  cause('BROKEN_FIRING_PIN_OR_PART', 'ALLOWABLE', 'Firing pin or another functional part broke', '8.9.4.1(f)'),
  cause('AUTOMATIC_FIRE', 'ALLOWABLE', 'Pistol fired automatically without trigger release', '8.9.4.1(g)'),
  cause('SLIDE_JAM_OR_CASE_NOT_EJECTED', 'ALLOWABLE', 'Slide jammed or empty case was not ejected', '8.9.4.1(h)'),
  cause(
    'PISTOL_TOUCHED_BEFORE_INSPECTION',
    'NON_ALLOWABLE',
    'Pistol or mechanism was touched before Range Officer inspection',
    '8.9.4.2(a)',
  ),
  cause('SAFETY_NOT_RELEASED', 'NON_ALLOWABLE', 'Safety catch was not released', '8.9.4.2(b)'),
  cause('PISTOL_NOT_LOADED', 'NON_ALLOWABLE', 'Pistol was not loaded', '8.9.4.2(c)'),
  cause('UNDERLOADED', 'NON_ALLOWABLE', 'Fewer cartridges than prescribed were loaded', '8.9.4.2(d)'),
  cause('TRIGGER_NOT_RESET', 'NON_ALLOWABLE', 'Trigger was not allowed to return far enough', '8.9.4.2(e)'),
  cause('WRONG_AMMUNITION', 'NON_ALLOWABLE', 'Pistol was loaded with the wrong ammunition', '8.9.4.2(f)'),
  cause(
    'MAGAZINE_INCORRECT_OR_DROPPED',
    'NON_ALLOWABLE',
    'Magazine was inserted incorrectly or fell out without mechanism damage',
    '8.9.4.2(g)',
  ),
  cause(
    'ATHLETE_CORRECTABLE',
    'NON_ALLOWABLE',
    'Cause could reasonably have been corrected by the athlete',
    '8.9.4.2(h)',
  ),
];

export function buildIssfGeneralQualificationMalfunction(
  stageIds: readonly string[],
): QualificationMalfunctionCapability {
  return {
    determinationAuthority: 'RANGE_OR_JURY_OFFICIAL',
    causes: generalCauses,
    repair: {
      maximumSeconds: null,
      juryMayExtend: false,
      completionScheduling: 'WITHIN_ORIGINAL_COMPETITION_TIME',
      replacement: {
        sameTypeAndCalibreRequired: true,
        targetedTestingRequired: true,
      },
      additionalSighting: { policy: 'JURY_MAY_ALLOW', shots: null },
      ruleReferences: ['6.13.3', '6.13.4'],
    },
    nonAllowableTreatment: {
      unfiredShots: 'MISS',
      refirePermitted: false,
      completionPermitted: false,
      ruleReference: '6.11.1.2(g), 6.13.4',
    },
    stages: stageIds.map((stageId) => ({
      stageId,
      allowableTreatment: { type: 'CONTINUE_WITHIN_ORIGINAL_TIME' },
      ruleReference: '6.13.3-4',
    })),
    documentation: {
      incidentRecords: ['RANGE_INCIDENT_REPORT'],
      selection: 'REQUIRED_FORM',
      rangeRegisterRequired: true,
      ruleReferences: ['6.13.8'],
    },
    ruleReferences: ['6.13.1-5', '6.13.8'],
  };
}

export function buildIssf25mQualificationMalfunction(input: {
  readonly claimLimit: QualificationMalfunctionClaimLimit;
  readonly stages: readonly {
    readonly stageId: string;
    readonly treatment: QualificationMalfunctionAllowableTreatment;
    readonly ruleReference: string;
  }[];
  readonly incidentForm: 'IR' | 'RFPM' | 'STDP';
}): QualificationMalfunctionCapability {
  return {
    determinationAuthority: 'RANGE_OFFICER',
    causes: pistol25mCauses,
    claimLimit: input.claimLimit,
    repair: {
      maximumSeconds: 900,
      juryMayExtend: true,
      completionScheduling: 'JURY_DETERMINED_TIME_AND_PLACE',
      replacement: {
        sameTypeAndCalibreRequired: true,
        sameMechanismRequired: true,
        targetedTestingRequired: true,
      },
      additionalSighting: { policy: 'JURY_MUST_ALLOW_SERIES', shots: 5 },
      ruleReferences: ['6.13.3', '8.9.2'],
    },
    nonAllowableTreatment: {
      unfiredShots: 'MISS',
      refirePermitted: false,
      completionPermitted: false,
      ruleReference: '8.9.4.4',
    },
    stages: input.stages.map(({ stageId, treatment, ruleReference }) => ({
      stageId,
      allowableTreatment: treatment,
      ruleReference,
    })),
    documentation: {
      incidentRecords: [input.incidentForm === 'IR' ? 'RANGE_INCIDENT_REPORT' : input.incidentForm],
      selection: 'REQUIRED_FORM',
      rangeRegisterRequired: true,
      ruleReferences: input.incidentForm === 'IR' ? ['6.13.8', '8.9.4.6(e)'] : ['6.13.8', '8.9.1(c)'],
    },
    ruleReferences: ['6.13', '8.9.1-4'],
  };
}

function cause(
  code: string,
  classification: QualificationMalfunctionCauseRule['classification'],
  label: string,
  ruleReference: string,
): QualificationMalfunctionCauseRule {
  return { code, classification, label, ruleReference };
}

import {
  settleQualificationMalfunctionRepeat,
  type QualificationMalfunctionCountedShot,
  type QualificationMalfunctionRepeatSettlement,
} from '@sasakiuri/saika-rules';

import {
  latestQualificationMalfunctionClassification,
  qualificationMalfunctionStatus,
  type QualificationMalfunctionCase,
  type QualificationMalfunctionEntry,
} from './QualificationMalfunctionCase';

export interface MalfunctionScoreEvidence {
  readonly shotId: string;
  readonly scoreX10: number;
  readonly targetIndex?: number;
  readonly evidenceReference: string;
  readonly outcome: 'HIT' | 'MISS' | 'LATE' | 'UNFIRED';
}

export interface MalfunctionScoreSheetInput {
  readonly caseId: string;
  readonly original: readonly MalfunctionScoreEvidence[];
  readonly recovery: readonly MalfunctionScoreEvidence[];
  readonly secondMalfunction?: { readonly zeroFillRow: 'ORIGINAL' | 'REPEAT'; readonly evidenceReference: string };
  readonly officialName: string;
  readonly officialRole: 'RTS_OFFICER' | 'JURY_MEMBER';
  readonly statement: string;
}

export interface MalfunctionScoreCalculation {
  readonly form: 'RFPM' | 'STDP' | 'IR';
  readonly ruleReference: string;
  readonly authorizationId: string;
  readonly executionEntryId: string;
  readonly executionArtifactId: string;
  readonly combination: 'LOWEST_PER_TARGET' | 'LOWEST_OVERALL' | 'NORMAL_SERIES';
  readonly countedShots: readonly QualificationMalfunctionCountedShot[];
  readonly discardedShotIds: readonly string[];
  readonly addedZeros: readonly QualificationMalfunctionCountedShot[];
  readonly totalX10: number;
}

export interface MalfunctionScoreSheet {
  readonly id: string;
  readonly version: number;
  readonly recordedAt: string;
  readonly digest: string;
  readonly input: MalfunctionScoreSheetInput;
  readonly calculation: MalfunctionScoreCalculation;
  readonly context: {
    readonly competitionId: string;
    readonly eventId: string;
    readonly participantId: string;
    readonly athleteName: string;
    readonly startNumber: string | null;
    readonly laneId: string;
    readonly laneChannel: number;
    readonly stageIndex: number;
    readonly seriesIndex: number;
    readonly rulePackIdentity: QualificationMalfunctionCase['rulePackIdentity'];
  };
}

/** Mechanical calculation only. Firing authorization and score application remain independent. */
export function calculateMalfunctionScoreSheet(
  value: QualificationMalfunctionCase,
  entries: readonly QualificationMalfunctionEntry[],
  input: MalfunctionScoreSheetInput,
): MalfunctionScoreCalculation {
  if (input.caseId !== value.id) throw new Error('Score evidence belongs to a different malfunction case');
  if (!['EXECUTED', 'SETTLED', 'COMPLETED'].includes(qualificationMalfunctionStatus(entries))) {
    throw new Error('Record recovery execution evidence before calculating the score');
  }
  if (value.claimMode !== 'CLAIM' || value.phase !== 'MATCH' || value.seriesShotLimit !== 5) {
    throw new Error('Malfunction score sheets require a five-shot Qualification MATCH claim');
  }
  if (!['RTS_OFFICER', 'JURY_MEMBER'].includes(input.officialRole)) {
    throw new Error('Score evidence must be confirmed by RTS or a Jury member');
  }
  required(input.officialName, 'Confirming official');
  required(input.statement, 'Evidence confirmation statement');
  const authorization = [...entries].reverse().find((entry) => entry.type === 'REMEDY_AUTHORIZED');
  const execution = [...entries].reverse().find((entry) => entry.type === 'EXECUTION_RECORDED');
  if (!authorization || !execution?.artifactId) throw new Error('Authorization and execution evidence are required');
  const all = [...input.original, ...input.recovery];
  if (new Set(all.map((shot) => shot.shotId)).size !== all.length) {
    throw new Error('Evidence shot IDs must be unique across original and recovery rows');
  }
  all.forEach(validateEvidence);
  if (input.original.length !== value.recordedShots || input.original.some((shot) => shot.outcome === 'UNFIRED')) {
    throw new Error('The original row must identify exactly the shots fired before the reported malfunction');
  }
  const stage = value.policySnapshot.stages.find((candidate) => candidate.stageId === value.stageId);
  if (!stage) throw new Error('The case policy has no matching stage');
  const treatment = stage.allowableTreatment;
  const reference = {
    authorizationId: authorization.id,
    executionEntryId: execution.id,
    executionArtifactId: execution.artifactId,
  };
  if (authorization.remedy === 'SCORE_UNFIRED_AS_MISS') {
    if (latestQualificationMalfunctionClassification(entries) !== 'NON_ALLOWABLE') {
      throw new Error('No-fire miss settlement requires a non-allowable classification');
    }
    if (input.recovery.length || input.secondMalfunction)
      throw new Error('A non-allowable malfunction permits no refire');
    const countedShots = input.original.map((shot) => counted('ORIGINAL', shot));
    const addedZeros = Array.from({ length: 5 - countedShots.length }, () => zero('ORIGINAL'));
    return normalResult([...countedShots, ...addedZeros], addedZeros, {
      ...reference,
      ruleReference: value.policySnapshot.nonAllowableTreatment.ruleReference,
    });
  }
  if (latestQualificationMalfunctionClassification(entries) !== 'ALLOWABLE') {
    throw new Error('Recovery score combination requires an allowable classification');
  }
  if (treatment.type === 'REPEAT_FULL_SERIES' && authorization.remedy === treatment.type) {
    if (authorization.shotsToFire !== treatment.shots)
      throw new Error('The repeat authorization shot count is invalid');
    if (input.secondMalfunction) {
      required(input.secondMalfunction.evidenceReference, 'Second malfunction evidence');
      if (all.some((shot) => shot.outcome === 'UNFIRED')) {
        throw new Error('Second-malfunction rows contain fired shots only; missing shots are added by the calculation');
      }
    }
    const settlement: QualificationMalfunctionRepeatSettlement = settleQualificationMalfunctionRepeat(
      treatment,
      [
        { row: 'ORIGINAL', shots: input.original },
        { row: 'REPEAT', shots: input.recovery },
      ],
      input.secondMalfunction?.zeroFillRow,
    );
    return {
      ...reference,
      countedShots: settlement.countedShots,
      discardedShotIds: settlement.discardedShotIds,
      addedZeros: settlement.addedZeros,
      totalX10: settlement.totalX10,
      combination: settlement.scoreCombination,
      form: treatment.incidentForm,
      ruleReference: stage.ruleReference,
    };
  }
  if (treatment.type === 'COMPLETE_REMAINING_SHOTS' && authorization.remedy === treatment.type) {
    if (input.secondMalfunction)
      throw new Error('Second-malfunction comparison applies only to RFPM and STDP repeat series');
    if (all.some((shot) => shot.targetIndex !== undefined))
      throw new Error('Series completion does not use a target-group index');
    if (authorization.shotsToFire !== 5 - input.original.length || all.length !== 5) {
      throw new Error('Identify every remaining shot, including explicitly confirmed misses or unfired zeros');
    }
    return normalResult(
      [
        ...input.original.map((shot) => counted('ORIGINAL', shot)),
        ...input.recovery.map((shot) => counted('REPEAT', shot)),
      ],
      [],
      { ...reference, ruleReference: stage.ruleReference },
    );
  }
  throw new Error('The authorized remedy does not support a malfunction score sheet');
}

function normalResult(
  countedShots: QualificationMalfunctionCountedShot[],
  addedZeros: QualificationMalfunctionCountedShot[],
  references: Pick<
    MalfunctionScoreCalculation,
    'authorizationId' | 'executionEntryId' | 'executionArtifactId' | 'ruleReference'
  >,
): MalfunctionScoreCalculation {
  return {
    ...references,
    form: 'IR',
    combination: 'NORMAL_SERIES',
    countedShots,
    addedZeros,
    discardedShotIds: [],
    totalX10: countedShots.reduce((total, shot) => total + shot.scoreX10, 0),
  };
}

function validateEvidence(shot: MalfunctionScoreEvidence): void {
  required(shot.shotId, 'Shot ID');
  required(shot.evidenceReference, 'Shot evidence reference');
  if (!Number.isInteger(shot.scoreX10) || shot.scoreX10 < 0 || shot.scoreX10 > 100 || shot.scoreX10 % 10 !== 0) {
    throw new Error('25m Qualification scores must be whole-ring values from 0 to 10');
  }
  if (!['HIT', 'MISS', 'LATE', 'UNFIRED'].includes(shot.outcome)) throw new Error('Shot outcome is invalid');
  if (shot.outcome !== 'HIT' && shot.scoreX10 !== 0) throw new Error('Miss, late and unfired shots must score zero');
  if (shot.outcome === 'HIT' && shot.scoreX10 === 0)
    throw new Error('A zero must identify its miss, late or unfired outcome');
}

function counted(row: 'ORIGINAL' | 'REPEAT', shot: MalfunctionScoreEvidence): QualificationMalfunctionCountedShot {
  return { row, shotId: shot.shotId, scoreX10: shot.scoreX10, targetIndex: shot.targetIndex ?? null, addedZero: false };
}
function zero(row: 'ORIGINAL' | 'REPEAT'): QualificationMalfunctionCountedShot {
  return { row, shotId: null, scoreX10: 0, targetIndex: null, addedZero: true };
}
function required(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

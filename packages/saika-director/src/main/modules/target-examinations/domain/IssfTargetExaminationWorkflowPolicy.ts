import type { TargetExaminationCase, TargetExaminationIssueKind } from './TargetExaminationCase';
import type { TargetExaminationEntry } from './TargetExaminationEntry';
import type { TargetExaminationEvidence, TargetExaminationEvidenceType } from './TargetExaminationEvidence';
import type {
  ITargetExaminationWorkflowPolicy,
  TargetExaminationWorkflowAssessment,
  TargetExaminationWorkflowStep,
} from './ITargetExaminationWorkflowPolicy';

interface EvidenceStepDefinition {
  id: string;
  label: string;
  ruleReference: string;
  guidance: string;
  evidenceType: TargetExaminationEvidenceType;
}

interface ManualStepDefinition {
  id: string;
  label: string;
  ruleReference: string;
  guidance: string;
}

const COMMON_EVIDENCE: readonly EvidenceStepDefinition[] = [
  {
    id: 'range-incident-report',
    label: 'Secure the Range Incident Report',
    ruleReference: 'ISSF 6.10.8.1.f',
    guidance: 'Append the report reference; scoring action remains in the separate scoring-decision workflow.',
    evidenceType: 'RANGE_INCIDENT_REPORT',
  },
  {
    id: 'est-log-print',
    label: 'Secure the EST LOG print',
    ruleReference: 'ISSF 6.10.8.1.g',
    guidance: 'Do not clear the LOG until the RTS Jury authorizes release of the evidence hold.',
    evidenceType: 'EST_LOG_PRINT',
  },
  {
    id: 'target-face-frame',
    label: 'Record examination of the target face and frame',
    ruleReference: 'ISSF 6.10.8.2',
    guidance: 'Record the location of shots outside the black aiming mark.',
    evidenceType: 'TARGET_FACE',
  },
];

const COMMON_MANUAL: readonly ManualStepDefinition[] = [
  {
    id: 'mark-custody-items',
    label: 'Mark each collected item with firing point, orientation, relay, series and collection time',
    ruleReference: 'ISSF 6.10.8.1',
    guidance: 'Confirm the markings on the physical item; this application stores custody metadata only.',
  },
  {
    id: 'count-locate-holes',
    label: 'Count and locate all shot holes',
    ruleReference: 'ISSF 6.10.8.4',
    guidance: 'Take both the number and location of holes into account.',
  },
  {
    id: 'independent-jury-assessments',
    label: 'Obtain independent Jury assessments before the formal decision',
    ruleReference: 'ISSF 6.10.8.5',
    guidance: 'Record the formal decision separately after the independent assessments are complete.',
  },
];

const ISSUE_STEPS: Readonly<Record<TargetExaminationIssueKind, readonly ManualStepDefinition[]>> = {
  SIGHTING_COMPLAINT: [
    {
      id: 'direct-test-shot-sighting',
      label: 'Direct and observe the required test shot during sighting',
      ruleReference: 'ISSF 6.10.5, 6.17.1.8.a',
      guidance: 'Use the applicable Qualification or Final procedure and record whether the test shot registered.',
    },
  ],
  NO_SHOT_INDICATION: [
    {
      id: 'record-complaint-time',
      label: 'Record the immediate complaint time',
      ruleReference: 'ISSF 6.10.9.3',
      guidance: 'The nearest Range Officer must make a written note of the complaint time.',
    },
    {
      id: 'direct-extra-match-shot',
      label: 'Direct one additional MATCH shot and record its value, location, time and number',
      ruleReference: 'ISSF 6.10.9.3',
      guidance: 'Also record the firing point in the Range Register and Range Incident Report.',
    },
    {
      id: 'rts-reconcile-shots',
      label: 'RTS Jury reconciles all shots with the EST computer record',
      ruleReference: 'ISSF 6.10.9.3.c-g',
      guidance: 'Record the Jury conclusion here; apply any score change through the scoring-decision workflow.',
    },
  ],
  UNEXPECTED_ZERO: [
    {
      id: 'finals-jury-quorum',
      label: 'Confirm the Finals Jury quorum (Jury Member-in-Charge, second Competition Jury member and RTS)',
      ruleReference: 'ISSF 6.17.1.8.b',
      guidance: 'This step applies to an unexpected zero during a Final MATCH shot or series.',
    },
    {
      id: 'assess-credible-miss-evidence',
      label: 'Assess whether credible evidence shows an off-target miss',
      ruleReference: 'ISSF 6.17.1.8.b',
      guidance: 'If credible evidence is absent, direct the applicable extra competition shot or series completion.',
    },
  ],
  SCORE_VALUE_PROTEST: [
    {
      id: 'adjacent-lane-log-prints',
      label: 'Generate detailed LOG prints for the protested and immediately adjacent lanes before reset',
      ruleReference: 'ISSF 6.10.7.a',
      guidance: 'Keep the target systems unchanged until the required prints are secured.',
    },
    {
      id: 'two-decimal-ring-test',
      label: 'Apply the two-decimal-ring test and applicable protest consequences',
      ruleReference: 'ISSF 6.16.5.2.b-c',
      guidance: 'A score-value decision is final for scoring purposes; record score changes separately.',
    },
  ],
  PAPER_OR_RUBBER_FAILURE: [
    {
      id: 'secure-paper-rubber',
      label: 'Secure and examine the applicable paper strip or rubber band',
      ruleReference: 'ISSF 6.10.8.1.d-e',
      guidance: 'Append the corresponding witness-strip or rubber-band evidence item.',
    },
  ],
  SINGLE_TARGET_FAILURE: [
    {
      id: 'record-repair-reserve-move',
      label: 'Record repair duration and any move to a reserve position',
      ruleReference: 'ISSF 6.10.9.2',
      guidance: 'Use the separate interruption workflow for official extra-time and sighting authorization.',
    },
  ],
  RANGE_TARGET_FAILURE: [
    {
      id: 'record-range-failure-facts',
      label: 'Record failure time, expired shooting time and completed competition shots',
      ruleReference: 'ISSF 6.10.9.1.a-b',
      guidance: 'Use the range-interruption workflow for STOP, restart and official grant execution.',
    },
  ],
  OTHER: [],
};

export class IssfTargetExaminationWorkflowPolicy implements ITargetExaminationWorkflowPolicy {
  evaluate(
    examination: TargetExaminationCase,
    evidence: readonly TargetExaminationEvidence[],
    entries: readonly TargetExaminationEntry[],
  ): TargetExaminationWorkflowAssessment {
    const types = new Set(evidence.map((item) => item.type));
    const evidenceSteps = COMMON_EVIDENCE.map<TargetExaminationWorkflowStep>((definition) => ({
      id: definition.id,
      label: definition.label,
      ruleReference: definition.ruleReference,
      guidance: definition.guidance,
      status: types.has(definition.evidenceType) ? 'COMPLETE' : 'MISSING',
    }));
    const manualSteps = [...COMMON_MANUAL, ...ISSUE_STEPS[examination.issueKind]].map<TargetExaminationWorkflowStep>(
      (definition) => ({ ...definition, status: 'MANUAL_CONFIRMATION' }),
    );
    const decisionRecorded = entries.some((entry) => entry.type === 'DECISION');
    const steps: TargetExaminationWorkflowStep[] = [
      ...evidenceSteps,
      ...manualSteps,
      {
        id: 'formal-jury-decision',
        label: 'Record the formal Jury / RTS decision',
        ruleReference: examination.ruleReferences,
        guidance: 'This record is evidence only and never changes the scored result automatically.',
        status: decisionRecorded ? 'COMPLETE' : 'MISSING',
      },
    ];
    return {
      policyId: 'ISSF-2026-TARGET-EXAMINATION-V1',
      advisoryOnly: true,
      readyForJuryDecision: evidenceSteps.every((step) => step.status === 'COMPLETE'),
      steps,
    };
  }
}

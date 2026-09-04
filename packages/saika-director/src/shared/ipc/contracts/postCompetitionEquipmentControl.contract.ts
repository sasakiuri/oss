import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const selectionBasis = z.enum([
  'RANDOM_DRAW',
  'TARGETED_CREDIBLE_EVIDENCE',
  'QUALIFICATION_FINALIST_TOP_10',
  'PISTOL_TRIGGER_RANDOM_DRAW',
]);
const outcome = z.enum(['PASSED', 'FAILED', 'DID_NOT_REPORT']);
const confirmerRole = z.enum([
  'EQUIPMENT_CONTROL_JURY_CHAIR',
  'EQUIPMENT_CONTROL_JURY_MEMBER',
  'COMPETITION_JURY_MEMBER',
]);
const entryBase = z.object({
  id: uuid,
  checkId: uuid,
  statement: z.string().min(1),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
});
const entry = z.discriminatedUnion('type', [
  entryBase.extend({
    type: z.literal('NOTICE_ISSUED'),
    deliveryMethod: z.string().min(1),
    noticeReference: z.string().min(1),
    officialName: z.string().min(1),
  }),
  entryBase.extend({
    type: z.literal('TEST_RECORDED'),
    outcome,
    testedItems: z.array(z.string().min(1)),
    clothingOrTapingCheck: z.boolean(),
    sameGenderJudgeAvailable: z.boolean().nullable(),
    attempts: z.number().int().min(1).max(3).nullable(),
    performedBy: z.string().min(1),
    equipmentControlJurySupervisor: z.string().min(1),
  }),
  entryBase.extend({
    type: z.literal('FAILURE_CONFIRMED'),
    confirmsEntryId: uuid,
    calibrationReference: z.string().min(1),
    confirmedBy: z.string().min(1),
    confirmerRole,
    testPerformedCorrectly: z.literal(true),
  }),
  entryBase.extend({ type: z.literal('CHECK_VOIDED'), officialName: z.string().min(1) }),
]);
const check = z.object({
  id: uuid,
  championshipId: uuid,
  eventId: uuid,
  eventName: z.string().min(1),
  eventType: z.string().min(1),
  round: z.string().min(1),
  participantId: uuid,
  athleteName: z.string().min(1),
  startNumber: z.string().nullable(),
  gender: z.string().min(1),
  selectionBasis,
  selectionStatement: z.string().min(1),
  selectedBy: z.string().min(1),
  selectedAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  ruleReferences: z.array(z.string().min(1)).min(1),
  status: z.enum([
    'SELECTED',
    'NOTIFIED',
    'PASSED',
    'FAILED_PENDING_CONFIRMATION',
    'FAILED_CONFIRMED',
    'DID_NOT_REPORT_PENDING_CONFIRMATION',
    'DID_NOT_REPORT_CONFIRMED',
    'VOIDED',
  ]),
  separateDisqualificationActionRequired: z.boolean(),
  sanctionAuthorityReference: z.string().min(1),
  entries: z.array(entry),
});
const select = z.object({
  championshipId: uuid,
  eventId: uuid,
  participantIds: z.array(uuid).min(1).max(200),
  selectionBasis,
  selectionStatement: text(5000),
  selectedBy: text(200),
  selectedAt: z.string().datetime(),
});
const issueNotice = z.object({
  checkId: uuid,
  deliveryMethod: text(200),
  noticeReference: text(500),
  officialName: text(200),
  statement: text(5000),
  issuedAt: z.string().datetime(),
});
const recordTest = z
  .object({
    checkId: uuid,
    outcome,
    testedItems: z.array(text(300)).max(50),
    clothingOrTapingCheck: z.boolean(),
    sameGenderJudgeAvailable: z.boolean().nullable(),
    attempts: z.number().int().min(1).max(3).nullable(),
    performedBy: text(200),
    equipmentControlJurySupervisor: text(200),
    statement: text(5000),
    testedAt: z.string().datetime(),
  })
  .superRefine((value, context) => {
    if (value.outcome !== 'DID_NOT_REPORT' && value.testedItems.length === 0) {
      context.addIssue({ code: 'custom', path: ['testedItems'], message: 'A completed test requires tested items' });
    }
    if (value.outcome === 'DID_NOT_REPORT' && value.testedItems.length > 0) {
      context.addIssue({ code: 'custom', path: ['testedItems'], message: 'A non-report cannot include tested items' });
    }
    if (value.clothingOrTapingCheck && value.sameGenderJudgeAvailable !== true) {
      context.addIssue({
        code: 'custom',
        path: ['sameGenderJudgeAvailable'],
        message: 'A same-gender judge must be available',
      });
    }
    if (!value.clothingOrTapingCheck && value.sameGenderJudgeAvailable !== null) {
      context.addIssue({
        code: 'custom',
        path: ['sameGenderJudgeAvailable'],
        message: 'Same-gender judge availability applies only to clothing or taping checks',
      });
    }
  });
const confirmFailure = z.object({
  checkId: uuid,
  calibrationReference: text(1000),
  confirmedBy: text(200),
  confirmerRole,
  statement: text(5000),
  confirmedAt: z.string().datetime(),
});
const voidCheck = z.object({
  checkId: uuid,
  reason: text(5000),
  officialName: text(200),
  voidedAt: z.string().datetime(),
});

export type PostCompetitionEquipmentCheckDto = z.infer<typeof check>;
export type SelectEquipmentControlAthletesPayload = z.infer<typeof select>;
export type IssueEquipmentControlNoticePayload = z.infer<typeof issueNotice>;
export type RecordEquipmentControlTestPayload = z.infer<typeof recordTest>;
export type ConfirmEquipmentControlFailurePayload = z.infer<typeof confirmFailure>;
export type VoidEquipmentControlCheckPayload = z.infer<typeof voidCheck>;

export const postCompetitionEquipmentControlContract = defineContract('postCompetitionEquipmentControl', {
  list: query(z.object({ championshipId: uuid }), queryResponseSchema(z.array(check))),
  select: command(select, commandDataResponseSchema(z.array(check))),
  issueNotice: command(issueNotice, commandDataResponseSchema(check)),
  recordTest: command(recordTest, commandDataResponseSchema(check)),
  confirmFailure: command(confirmFailure, commandDataResponseSchema(check)),
  voidCheck: command(voidCheck, commandDataResponseSchema(check)),
});

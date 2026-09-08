import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(1000);
const optionalText = text.nullable();
const date = z.iso.date();
export const equipmentDetailsSchema = z.object({
  athleteIdentityId: uuid,
  category: z.enum(['RIFLE', 'PISTOL', 'JACKET', 'TROUSERS', 'SHOES', 'CYLINDER', 'OTHER']),
  description: text,
  manufacturer: optionalText,
  serialNumber: optionalText,
  calibre: optionalText,
  sealNumber: optionalText,
  cardReference: optionalText,
  externalRegistrationReference: optionalText,
  manufacturedOn: date.nullable(),
  validUntil: date.nullable(),
  retired: z.boolean(),
});
const base = z.object({
  id: uuid,
  championshipId: uuid,
  officialName: text,
  statement: text,
  recordedAt: z.iso.datetime(),
});
export const equipmentRegistryEntrySchema = z.discriminatedUnion('kind', [
  base.extend({ kind: z.literal('EQUIPMENT'), equipmentId: uuid, athleteName: text, details: equipmentDetailsSchema }),
  base.extend({ kind: z.literal('CALIBRATION'), testingDate: date, instrument: text, reference: text }),
  base.extend({
    kind: z.literal('INSPECTION'),
    equipmentId: uuid,
    equipmentRecordId: uuid,
    testingDate: date,
    outcome: z.enum(['PASSED', 'FAILED', 'INCOMPLETE']),
    testedItems: text,
    calibrationIds: z.array(uuid).max(50),
  }),
  base.extend({ kind: z.literal('WITHDRAWAL'), withdrawsId: uuid }),
]);
const scope = z.object({ championshipId: uuid, asOfDate: date });
const mutation = scope.extend({
  expectedRevision: z.number().int().nonnegative(),
  officialName: text,
  statement: text,
});
export const saveEquipmentSchema = mutation.extend({ equipmentId: uuid.nullable(), details: equipmentDetailsSchema });
export const recordCalibrationSchema = mutation.extend({ testingDate: date, instrument: text, reference: text });
export const recordEquipmentInspectionSchema = mutation.extend({
  equipmentId: uuid,
  testingDate: date,
  outcome: z.enum(['PASSED', 'FAILED', 'INCOMPLETE']),
  testedItems: text,
  calibrationIds: z.array(uuid).max(50),
});
export const withdrawEquipmentRecordSchema = mutation.extend({ withdrawsId: uuid });
const athlete = z.object({ id: uuid, name: text, issfId: optionalText });
const workspace = z.object({
  revision: z.number().int().nonnegative(),
  athletes: z.array(athlete),
  entries: z.array(equipmentRegistryEntrySchema),
  equipment: z.array(
    z.object({
      equipmentId: uuid,
      recordId: uuid,
      athleteName: text,
      details: equipmentDetailsSchema,
      currentInspectionId: uuid.nullable(),
      inspectionCount: z.number().int().nonnegative(),
      advisories: z.array(z.string()),
    }),
  ),
  activeCalibrationIds: z.array(uuid),
});
export type EquipmentDetails = z.infer<typeof equipmentDetailsSchema>;
export type EquipmentRegistryEntry = z.infer<typeof equipmentRegistryEntrySchema>;
export type EquipmentRegistryWorkspace = z.infer<typeof workspace>;
export type EquipmentAthlete = z.infer<typeof athlete>;
export const equipmentRegistryContract = defineContract('equipmentRegistry', {
  getWorkspace: query(scope, queryResponseSchema(workspace)),
  saveEquipment: command(saveEquipmentSchema, commandDataResponseSchema(workspace)),
  recordCalibration: command(recordCalibrationSchema, commandDataResponseSchema(workspace)),
  recordInspection: command(recordEquipmentInspectionSchema, commandDataResponseSchema(workspace)),
  withdraw: command(withdrawEquipmentRecordSchema, commandDataResponseSchema(workspace)),
});

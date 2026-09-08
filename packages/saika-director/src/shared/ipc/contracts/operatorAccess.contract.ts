import { z } from 'zod';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

export const operatorPermissionSchema = z.enum(['ADMIN', 'OPERATE', 'OFFICIATE', 'EQUIPMENT']);
export const operatorOfficialRoleSchema = z.enum(['JURY_MEMBER', 'EQUIPMENT_CONTROL_JURY', 'ANTI_DOPING_AUTHORITY']);
const name = z.string().trim().min(1).max(150);
const account = z.object({
  id: z.string().uuid(),
  name,
  permissions: z.array(operatorPermissionSchema),
  officialRoles: z.array(operatorOfficialRoleSchema),
  disabled: z.boolean(),
});
const status = z.object({
  enabled: z.boolean(),
  setupRequired: z.boolean(),
  actor: account.nullable(),
  expiresAt: z.iso.datetime().nullable(),
});
export const saveOperatorAccountSchema = z.object({
  id: z.string().uuid().nullable(),
  name,
  permissions: z.array(operatorPermissionSchema).max(4),
  officialRoles: z.array(operatorOfficialRoleSchema).max(3),
  disabled: z.boolean(),
  password: z.string().min(10).max(200).nullable(),
});
const audit = z.object({
  id: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  actorName: z.string().nullable(),
  operation: z.string(),
  outcome: z.enum(['ACCEPTED', 'RETURNED', 'THREW', 'DENIED']),
  recordedAt: z.iso.datetime(),
});
export type OperatorAccount = z.infer<typeof account>;
export type OperatorAccessStatus = z.infer<typeof status>;
export type OperatorAuditEntry = z.infer<typeof audit>;
export type OperatorPermission = z.infer<typeof operatorPermissionSchema>;
export const operatorAccessContract = defineContract('operatorAccess', {
  status: query(z.void(), queryResponseSchema(status)),
  signIn: command(z.object({ name, password: z.string().min(1).max(200) }), commandDataResponseSchema(status)),
  signOut: command(z.void(), commandDataResponseSchema(status)),
  setEnabled: command(z.object({ enabled: z.boolean() }), commandDataResponseSchema(status)),
  saveAccount: command(saveOperatorAccountSchema, commandDataResponseSchema(status)),
  getAdministration: query(
    z.void(),
    queryResponseSchema(z.object({ accounts: z.array(account), audit: z.array(audit) })),
  ),
});

// SPDX-License-Identifier: MIT
import { randomBytes, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import { VistaCatalogSchema, VistaIdentitySchema } from '@sasakiuri/saika-protocol/Vista';
import { isVistaEndpoint } from '@sasakiuri/saika-protocol/vista-node';
import { z } from 'zod';

import { PairingSecretSchema, ScreenConfigSchema, type SubjectRef } from '../shared/model';

const Endpoint = z
  .string()
  .url()
  .refine((value) => isVistaEndpoint(new URL(value)), 'Use a Vista HTTP endpoint without a path, credentials or query');
const Connection = z.object({ id: z.string().min(1), endpoint: Endpoint, secret: PairingSecretSchema });
export const DocumentSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  secret: z.string().min(32),
  port: z.number().int().nonnegative().max(65535),
  generation: z.number().int().nonnegative().safe(),
  controller: z.object({ id: z.string().min(1), generation: z.number().int().nonnegative().safe() }).nullable(),
  releasing: z.boolean(),
  screens: z.array(ScreenConfigSchema),
  sources: z.array(Connection.extend({ catalog: VistaCatalogSchema })),
  sourceIdentities: z.array(VistaIdentitySchema),
  peers: z.array(Connection.extend({ desired: z.array(ScreenConfigSchema) })),
  // Keep each saved value intact. DisplayState validates subjects independently.
  snapshots: z.array(z.unknown()),
  loginStart: z.boolean(),
});
export type Document = z.infer<typeof DocumentSchema>;
export const newDocument = (): Document => ({
  version: 1,
  id: randomUUID(),
  name: hostname(),
  secret: randomBytes(32).toString('base64url'),
  port: 0,
  generation: 0,
  controller: null,
  releasing: false,
  screens: [],
  sources: [],
  sourceIdentities: [],
  peers: [],
  snapshots: [],
  loginStart: false,
});
export const snapshotKey = (subject: SubjectRef): string => JSON.stringify([subject.sourceId, subject.subjectId]);
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : 'Vista could not complete the operation';
export { Endpoint };

// SPDX-License-Identifier: MIT
import {
  VistaCatalogSchema,
  VistaIdentitySchema,
  VistaSnapshotSchema,
  type VistaNode,
} from '@sasakiuri/saika-protocol/Vista';
import { z } from 'zod';

const Id = z.string().min(1).max(256);
/** A pairing secret shown on a source or display PC. */
export const PairingSecretSchema = z.string().min(32).max(256);
export const SelectionSchema = z.object({
  sourceId: Id,
  subjectId: Id,
  participantIds: z.array(Id),
  follow: z.enum(['lane', 'athlete']),
  label: z.string().max(200),
});
export const ScreenConfigSchema = z.object({
  id: Id,
  monitorId: Id,
  name: z.string().min(1).max(200),
  revision: z.number().int().positive().safe(),
  view: z.enum(['targets', 'ranking', 'focus', 'final']),
  selections: z.array(SelectionSchema),
  standby: z.boolean(),
  slots: z.number().int().positive().max(100),
  autoRotate: z.boolean(),
  pageSeconds: z.number().min(1).max(3600),
  page: z.number().int().nonnegative(),
  zoom: z.number().min(1).max(16),
  shotFilter: z.enum(['all', 'series', 'recent']),
  recentShots: z.number().int().positive().max(1000),
  autoStart: z.boolean(),
});
export type ScreenConfig = z.infer<typeof ScreenConfigSchema>;
export type Selection = z.infer<typeof SelectionSchema>;
export const SnapshotEntrySchema = z.object({
  snapshot: VistaSnapshotSchema,
  state: z.enum(['live', 'saved', 'stale', 'missing', 'unsupported', 'syncing']),
  receivedAt: z.number().finite(),
  error: z.string().nullable(),
});
export type SnapshotEntry = z.infer<typeof SnapshotEntrySchema>;
/** A competition subject of one source, as selected for a screen or received in a snapshot. */
export type SubjectRef = Pick<Selection, 'sourceId' | 'subjectId'>;
export const sameSubject = (a: SubjectRef, b: SubjectRef): boolean =>
  a.sourceId === b.sourceId && a.subjectId === b.subjectId;
/** The entry received for a subject. */
export const findEntry = (entries: SnapshotEntry[], subject: SubjectRef): SnapshotEntry | undefined =>
  entries.find((entry) => sameSubject(entry.snapshot, subject));
const MonitorSchema = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  primary: z.boolean(),
});
export type Monitor = z.infer<typeof MonitorSchema>;
const ScreenStatusSchema = z.object({
  config: ScreenConfigSchema,
  appliedRevision: z.number().int().nullable(),
  renderedRevision: z.number().int().nullable(),
  renderAlive: z.boolean(),
  monitorAvailable: z.boolean(),
  error: z.string().nullable(),
});
export type ScreenStatus = z.infer<typeof ScreenStatusSchema>;
/** The state a display PC reports to its controller. */
export const NodeStateSchema = z.object({
  identity: VistaIdentitySchema,
  controllerId: z.string().nullable(),
  persistenceError: z.string().nullable(),
  resumableSubjects: z.array(z.object({ sourceId: z.string().min(1), subjectId: z.string().min(1) })),
  monitors: z.array(MonitorSchema),
  screens: z.array(ScreenStatusSchema),
});
export type NodeState = z.infer<typeof NodeStateSchema>;
export type SourceView = {
  id: string;
  endpoint: string;
  catalog: z.infer<typeof VistaCatalogSchema>;
  state: 'connected' | 'offline' | 'connecting';
  error: string | null;
};
export type PeerView = { id: string; endpoint: string; node: NodeState | null; error: string | null };
export type AppState = {
  local: NodeState;
  endpoints: string[];
  pairingSecret: string;
  sources: SourceView[];
  peers: PeerView[];
  snapshots: SnapshotEntry[];
  error: string | null;
  loginStart: boolean;
};
export type AudienceState = {
  config: ScreenConfig;
  entries: SnapshotEntry[];
  identifyUntil: number;
  saved: boolean;
};
export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('inspectSubject'), sourceId: Id, subjectId: Id }),
  z.object({ type: z.literal('connectSource'), endpoint: z.string().url(), secret: PairingSecretSchema }),
  z.object({ type: z.literal('removeSource'), id: Id }),
  z.object({ type: z.literal('connectPeer'), endpoint: z.string().url(), secret: PairingSecretSchema }),
  z.object({ type: z.literal('removePeer'), id: Id }),
  z.object({ type: z.literal('apply'), nodeId: Id, config: ScreenConfigSchema }),
  z.object({ type: z.literal('identify'), nodeId: Id, screenId: Id }),
  z.object({ type: z.literal('openScreen'), screenId: Id }),
  z.object({ type: z.literal('closeScreen'), screenId: Id }),
  z.object({ type: z.literal('removeScreen'), nodeId: Id, screenId: Id }),
  z.object({ type: z.literal('revokeController') }),
  z.object({ type: z.literal('setLoginStart'), enabled: z.boolean() }),
]);
export type Command = z.infer<typeof CommandSchema>;
export type VistaBridge = {
  getState(): Promise<AppState>;
  command(command: Command): Promise<void>;
  discover(): Promise<VistaNode[]>;
  getAudience(): Promise<AudienceState>;
  rendered(revision: number): Promise<void>;
  onChange(callback: () => void): () => void;
};

declare global {
  interface Window {
    vista: VistaBridge;
  }
}

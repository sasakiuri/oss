// SPDX-License-Identifier: MIT
import { VistaCatalogSchema, VistaIdentitySchema, VistaSnapshotSchema } from '@sasakiuri/saika-protocol/Vista';
import { z } from 'zod';

const Id = z.string().min(1).max(256);
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
export type Monitor = { id: string; name: string; width: number; height: number; primary: boolean };
export type ScreenStatus = {
  config: ScreenConfig;
  appliedRevision: number | null;
  renderedRevision: number | null;
  renderAlive: boolean;
  monitorAvailable: boolean;
  error: string | null;
};
export type NodeState = {
  identity: z.infer<typeof VistaIdentitySchema>;
  monitors: Monitor[];
  screens: ScreenStatus[];
  controllerId: string | null;
  resumableSubjects: Array<Pick<Selection, 'sourceId' | 'subjectId'>>;
};
export type SourceView = {
  id: string;
  endpoint: string;
  catalog: z.infer<typeof VistaCatalogSchema> | null;
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
  z.object({ type: z.literal('connectSource'), endpoint: z.string().url(), secret: z.string().min(32).max(256) }),
  z.object({ type: z.literal('removeSource'), id: Id }),
  z.object({ type: z.literal('connectPeer'), endpoint: z.string().url(), secret: z.string().min(32).max(256) }),
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
export type Discovery = { identity: z.infer<typeof VistaIdentitySchema>; endpoint: string };
export type VistaBridge = {
  getState(): Promise<AppState>;
  command(command: Command): Promise<void>;
  discover(): Promise<Discovery[]>;
  getAudience(): Promise<AudienceState>;
  rendered(revision: number): Promise<void>;
  onChange(callback: () => void): () => void;
};

declare global {
  interface Window {
    vista: VistaBridge;
  }
}

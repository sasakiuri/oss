// SPDX-License-Identifier: MIT
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';

import {
  VistaCatalogSchema,
  VistaIdentitySchema,
  VistaSnapshotSchema,
  VISTA_CATALOG_PATH,
  vistaSnapshotPath,
  type VistaIdentity,
} from '@sasakiuri/saika-protocol/Vista';
import {
  createVistaDiscovery,
  createVistaServer,
  discoverVistaNodes,
  requestVista,
  type VistaServer,
} from '@sasakiuri/saika-protocol/vista-node';
import { z } from 'zod';

import {
  CommandSchema,
  ScreenConfigSchema,
  type AppState,
  type Command,
  type Monitor,
  type NodeState,
  type PeerView,
  type ScreenConfig,
  type SourceView,
} from '../shared/model';

import { AtomicStore } from './AtomicStore';
import { DisplayState, OwnerSchema } from './DisplayState';
import { DocumentSchema, Endpoint, messageOf, newDocument, snapshotKey } from './document';

export interface DesktopPort {
  monitors(): Monitor[];
  open(config: ScreenConfig): void;
  close(id: string): void;
  status(id: string): { revision: number | null; alive: boolean };
  loginStart(enabled: boolean): Promise<void>;
  changed(): void;
}

const NodeStateSchema = z.object({
  identity: VistaIdentitySchema,
  controllerId: z.string().nullable(),
  persistenceError: z.string().nullable(),
  resumableSubjects: z.array(z.object({ sourceId: z.string().min(1), subjectId: z.string().min(1) })),
  monitors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      width: z.number().positive(),
      height: z.number().positive(),
      primary: z.boolean(),
    }),
  ),
  screens: z.array(
    z.object({
      config: ScreenConfigSchema,
      appliedRevision: z.number().int().nullable(),
      renderedRevision: z.number().int().nullable(),
      renderAlive: z.boolean(),
      monitorAvailable: z.boolean(),
      error: z.string().nullable(),
    }),
  ),
});

/** Composition of source acquisition, durable display state and authenticated peer control. */
export class VistaApplication {
  readonly identity: VistaIdentity;
  readonly state: DisplayState;
  private server: VistaServer | null = null;
  private discovery: { close(): void } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private sequence = 0;
  private lastCatalog = new Map<string, number>();
  private sourceViews = new Map<string, SourceView>();
  private peerViews = new Map<string, PeerView>();
  private peerScreenErrors = new Map<string, Map<string, string>>();
  private error: string | null = null;
  private listenerError: string | null = null;
  private loginStartError: string | null = null;
  private peerSignatures = new Map<string, string>();
  private commandQueue: Promise<unknown> = Promise.resolve();
  private activePolls = new Set<string>();
  private activeTasks = new Set<Promise<void>>();
  private peerFrameAt = new Map<string, number>();
  private releaseTask: Promise<void> | null = null;

  private constructor(
    state: DisplayState,
    private readonly desktop: DesktopPort,
  ) {
    this.state = state;
    this.identity = {
      protocolVersion: 1,
      sourceId: state.document.id,
      bootId: randomUUID(),
      kind: 'display',
      name: state.document.name,
    };
  }

  static async start(directory: string, desktop: DesktopPort): Promise<VistaApplication> {
    const store = new AtomicStore(join(directory, 'vista.json'), DocumentSchema);
    const document = await store.read(newDocument);
    const state = new DisplayState(document, store, () => desktop.changed());
    await state.transact((current) => ({
      ...current,
      generation: current.generation + 1,
      ...(current.releasing
        ? { controller: null, releasing: false, secret: randomBytes(32).toString('base64url') }
        : {}),
    }));
    const application = new VistaApplication(state, desktop);
    await application.listen();
    for (const config of state.document.screens)
      if (config.autoStart) {
        try {
          desktop.open(config);
        } catch (error) {
          application.error = messageOf(error);
        }
      }
    if (state.document.loginStart) {
      try {
        await desktop.loginStart(true);
      } catch (error) {
        application.loginStartError = `Could not restore login startup: ${messageOf(error)}. Retry the setting in Display PCs on this PC.`;
      }
    }
    application.timer = setTimeout(() => void application.tick(), 0);
    return application;
  }

  private async listen(): Promise<void> {
    try {
      this.server = await createVistaServer({
        identity: this.identity,
        secret: () => this.state.document.secret,
        port: this.state.document.port,
        handle: (method, path, body) => this.handleRemote(method, path, body),
      });
    } catch (error) {
      // A local listener failure must not prevent restoration or outgoing source acquisition.
      // Invalid authority and subsequent persistence failures still fail startup.
      if (!(error instanceof Error) || !('syscall' in error) || error.syscall !== 'listen') throw error;
      this.server = null;
      this.listenerError = `Display connections are unavailable on TCP port ${this.state.document.port}: ${messageOf(error)}. Resolve the port conflict or access restriction, then restart Vista.`;
      return;
    }
    try {
      if (this.state.document.port !== this.server.port)
        await this.state.transact((document) => ({ ...document, port: this.server!.port }));
      this.discovery = createVistaDiscovery(this.identity, this.server.port);
    } catch (error) {
      const failed = this.server;
      this.server = null;
      await failed.close();
      throw error;
    }
    this.listenerError = null;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.releaseTask;
    this.discovery?.close();
    await this.server?.close();
    await Promise.allSettled([...this.activeTasks]);
    await this.commandQueue.catch(() => undefined);
    await this.state.flush();
  }

  private owner(): z.infer<typeof OwnerSchema> {
    return { controllerId: this.identity.sourceId, controllerGeneration: this.state.document.generation };
  }

  private resumableSubjects(): NodeState['resumableSubjects'] {
    return this.state
      .getEntries()
      .filter((entry) => entry.state === 'live' || entry.snapshot.finished)
      .map(({ snapshot }) => ({ sourceId: snapshot.sourceId, subjectId: snapshot.subjectId }));
  }

  node(): NodeState {
    const monitors = this.desktop.monitors();
    const entries = this.state.getEntries();
    return {
      identity: this.identity,
      monitors,
      controllerId: this.state.document.controller?.id ?? null,
      persistenceError: this.state.persistenceError,
      resumableSubjects: this.resumableSubjects(),
      screens: this.state.document.screens.map((config) => {
        const renderer = this.desktop.status(config.id);
        const available = monitors.some((monitor) => monitor.id === config.monitorId);
        return {
          config,
          appliedRevision: this.state.persistenceError ? null : config.revision,
          renderedRevision: renderer.revision,
          renderAlive: renderer.alive,
          monitorAvailable: available,
          error: available
            ? (entries.find(
                (entry) =>
                  entry.error &&
                  config.selections.some(
                    (selection) =>
                      selection.sourceId === entry.snapshot.sourceId &&
                      selection.subjectId === entry.snapshot.subjectId,
                  ),
              )?.error ??
              this.state.persistenceError ??
              this.state.snapshotErrors(config.selections))
            : 'The saved monitor is disconnected',
        };
      }),
    };
  }

  view(): AppState {
    return {
      local: this.node(),
      endpoints: this.server?.endpoints ?? [],
      pairingSecret: this.state.document.secret,
      sources: this.state.document.sources.map(
        (source) =>
          this.sourceViews.get(source.id) ?? {
            id: source.id,
            endpoint: source.endpoint,
            catalog: source.catalog,
            state: 'connecting',
            error: null,
          },
      ),
      peers: this.state.document.peers.map((peer) => {
        const cached = this.peerViews.get(peer.id);
        const view = cached?.node
          ? cached
          : {
              id: peer.id,
              endpoint: peer.endpoint,
              node: {
                identity: {
                  protocolVersion: 1 as const,
                  sourceId: peer.id,
                  bootId: 'unconfirmed',
                  kind: 'display' as const,
                  name: peer.endpoint,
                },
                controllerId: null,
                persistenceError: null,
                resumableSubjects: [],
                monitors: [],
                screens: peer.desired.map((config) => ({
                  config,
                  appliedRevision: null,
                  renderedRevision: null,
                  renderAlive: false,
                  monitorAvailable: false,
                  error: 'Waiting for the display PC to reconnect',
                })),
              },
              error: cached?.error ?? 'Waiting for the display PC to reconnect',
            };
        if (!view.node) return view;
        return {
          ...view,
          node: {
            ...view.node,
            screens: peer.desired.map((config) => {
              const actual = view.node!.screens.find((screen) => screen.config.id === config.id);
              return {
                config,
                appliedRevision: actual?.appliedRevision ?? null,
                renderedRevision: actual?.renderedRevision ?? null,
                renderAlive: !view.error && (actual?.renderAlive ?? false),
                monitorAvailable: actual?.monitorAvailable ?? true,
                error: view.error ?? this.peerScreenErrors.get(peer.id)?.get(config.id) ?? actual?.error ?? null,
              };
            }),
          },
        };
      }),
      snapshots: this.state.getEntries(),
      error:
        [this.listenerError, this.loginStartError, this.error, this.state.persistenceError, this.state.snapshotErrors()]
          .filter(Boolean)
          .join(' ') || null,
      loginStart: this.state.document.loginStart,
    };
  }

  discover(): ReturnType<typeof discoverVistaNodes> {
    return discoverVistaNodes();
  }

  command(input: unknown): Promise<void> {
    const command = CommandSchema.parse(input);
    const operation = this.commandQueue
      .catch(() => undefined)
      .then(async () => {
        const remoteWarning = await this.execute(command);
        const warning = [this.state.persistenceError, remoteWarning].filter(Boolean).join(' ');
        if (warning)
          throw new Error(
            command.type === 'setLoginStart'
              ? `Login startup is now ${command.enabled ? 'enabled' : 'disabled'}. ${warning}. Retry saving this setting.`
              : `The change took effect, but durable storage was not confirmed. ${warning}`,
          );
      });
    this.commandQueue = operation;
    return operation;
  }

  private async execute(command: Command): Promise<string | null> {
    let remoteWarning: string | null = null;
    switch (command.type) {
      case 'inspectSubject': {
        const source = this.state.document.sources.find((candidate) => candidate.id === command.sourceId);
        if (!source) throw new Error('Source is not connected');
        await this.fetchSubject(source, command.subjectId);
        break;
      }
      case 'connectSource': {
        const endpoint = Endpoint.parse(command.endpoint);
        const catalog = VistaCatalogSchema.parse(
          await requestVista(endpoint, command.secret, 'GET', VISTA_CATALOG_PATH),
        );
        if (catalog.identity.kind === 'display') throw new Error('Choose a Lane or Director source');
        await this.state.transact((document) => ({
          ...document,
          sources: [
            ...document.sources.filter((source) => source.id !== catalog.identity.sourceId),
            { id: catalog.identity.sourceId, endpoint, secret: command.secret, catalog },
          ],
          sourceIdentities: [
            ...document.sourceIdentities.filter((identity) => identity.sourceId !== catalog.identity.sourceId),
            catalog.identity,
          ],
        }));
        this.sourceViews.set(catalog.identity.sourceId, {
          id: catalog.identity.sourceId,
          endpoint,
          catalog,
          state: 'connected',
          error: null,
        });
        this.lastCatalog.set(catalog.identity.sourceId, Date.now());
        break;
      }
      case 'removeSource': {
        await this.state.transact((document) => ({
          ...document,
          sources: document.sources.filter((source) => source.id !== command.id),
        }));
        for (const entry of this.state.getEntries())
          if (entry.snapshot.sourceId === command.id)
            await this.state.updateEntry({
              ...entry,
              state: 'saved',
              error: 'The source was disconnected by the operator',
            });
        this.sourceViews.delete(command.id);
        this.lastCatalog.delete(command.id);
        break;
      }
      case 'connectPeer': {
        this.assertControllerRole();
        const endpoint = Endpoint.parse(command.endpoint);
        const node = NodeStateSchema.parse(
          await requestVista(endpoint, command.secret, 'GET', '/vista/v1/display/state'),
        );
        if (node.identity.kind !== 'display' || node.identity.sourceId === this.identity.sourceId)
          throw new Error('Choose another Vista display PC');
        this.assertControllerRole();
        const registered = NodeStateSchema.parse(
          await requestVista(
            endpoint,
            command.secret,
            'POST',
            '/vista/v1/display/register',
            this.owner(),
            node.identity.sourceId,
          ),
        );
        remoteWarning = registered.persistenceError;
        try {
          await this.state.transact((document) => {
            this.assertControllerRole(document);
            return {
              ...document,
              peers: [
                ...document.peers.filter((peer) => peer.id !== node.identity.sourceId),
                {
                  id: node.identity.sourceId,
                  endpoint,
                  secret: command.secret,
                  desired:
                    document.peers.find((peer) => peer.id === node.identity.sourceId && peer.secret === command.secret)
                      ?.desired ?? node.screens.map((screen) => screen.config),
                },
              ],
            };
          });
        } catch (error) {
          if (!this.state.document.peers.some((peer) => peer.id === node.identity.sourceId))
            throw new Error(
              `${messageOf(error)} The display PC registered control, but pairing was not saved here. Revoke remote control on that display PC before retrying.`,
              { cause: error },
            );
          throw error;
        }
        this.peerViews.set(node.identity.sourceId, {
          id: node.identity.sourceId,
          endpoint,
          node: registered,
          error: null,
        });
        break;
      }
      case 'removePeer': {
        const peer = this.peer(command.id);
        // A disconnected peer remains listed until revocation reaches the actual device.
        const released = NodeStateSchema.parse(
          await requestVista(peer.endpoint, peer.secret, 'POST', '/vista/v1/display/release', this.owner(), peer.id),
        );
        remoteWarning = released.persistenceError;
        await this.state.transact((document) => ({
          ...document,
          peers: document.peers.filter((saved) => saved.id !== peer.id),
        }));
        this.peerViews.delete(peer.id);
        this.peerScreenErrors.delete(peer.id);
        break;
      }
      case 'apply': {
        if (command.nodeId !== this.identity.sourceId) this.assertControllerRole();
        await this.validateSelection(command.config, command.nodeId);
        if (command.nodeId === this.identity.sourceId) {
          await this.state.apply(command.config, this.desktop.monitors());
          this.desktop.open(command.config);
        } else {
          const peer = this.peer(command.nodeId);
          const previous = peer.desired.find((screen) => screen.id === command.config.id);
          if (previous && command.config.revision <= previous.revision)
            throw new Error('Refresh the screen editor before applying a new revision');
          await this.state.transact((document) => ({
            ...document,
            peers: document.peers.map((saved) =>
              saved.id !== peer.id
                ? saved
                : {
                    ...saved,
                    desired: [...saved.desired.filter((screen) => screen.id !== command.config.id), command.config],
                  },
            ),
          }));
          await this.syncPeer(peer.id);
          const error =
            this.peerViews.get(peer.id)?.error ?? this.peerScreenErrors.get(peer.id)?.get(command.config.id);
          if (error) throw new Error(error);
          remoteWarning = this.peerViews.get(peer.id)?.node?.persistenceError ?? null;
        }
        break;
      }
      case 'identify': {
        if (command.nodeId === this.identity.sourceId) {
          this.state.identifyScreen(command.screenId);
          const config = this.state.document.screens.find((screen) => screen.id === command.screenId)!;
          this.desktop.open(config);
        } else {
          this.assertControllerRole();
          const peer = this.peer(command.nodeId);
          const identified = NodeStateSchema.parse(
            await requestVista(
              peer.endpoint,
              peer.secret,
              'POST',
              '/vista/v1/display/identify',
              { ...this.owner(), screenId: command.screenId },
              peer.id,
            ),
          );
          remoteWarning = identified.persistenceError;
        }
        break;
      }
      case 'openScreen': {
        const config = this.state.document.screens.find((screen) => screen.id === command.screenId);
        if (!config) throw new Error('Screen not found');
        this.desktop.open(config);
        break;
      }
      case 'closeScreen':
        this.desktop.close(command.screenId);
        break;
      case 'removeScreen': {
        if (command.nodeId === this.identity.sourceId) {
          await this.state.remove(command.screenId);
          this.desktop.close(command.screenId);
        } else {
          this.assertControllerRole();
          await this.enqueuePeer(command.nodeId, async () => {
            const peer = this.peer(command.nodeId);
            const removed = NodeStateSchema.parse(
              await requestVista(
                peer.endpoint,
                peer.secret,
                'POST',
                '/vista/v1/display/remove',
                { ...this.owner(), screenId: command.screenId },
                peer.id,
              ),
            );
            remoteWarning = removed.persistenceError;
            await this.state.transact((document) => ({
              ...document,
              peers: document.peers.map((saved) =>
                saved.id !== peer.id
                  ? saved
                  : { ...saved, desired: saved.desired.filter((screen) => screen.id !== command.screenId) },
              ),
            }));
          });
        }
        break;
      }
      case 'revokeController': {
        await this.releaseTask;
        this.discovery?.close();
        await this.server?.close();
        await this.state.transact((document) => ({
          ...document,
          controller: null,
          releasing: false,
          secret: randomBytes(32).toString('base64url'),
        }));
        await this.listen();
        break;
      }
      case 'setLoginStart': {
        const previous = this.state.document.loginStart;
        await this.desktop.loginStart(command.enabled);
        this.loginStartError = null;
        try {
          await this.state.transact((document) => ({ ...document, loginStart: command.enabled }));
        } catch (error) {
          try {
            await this.desktop.loginStart(previous);
          } catch (restoreError) {
            throw new Error(
              `Could not save login startup: ${messageOf(error)}. Could not restore the previous operating system setting: ${messageOf(restoreError)}. Check login startup in your system settings.`,
              { cause: error },
            );
          }
          throw new Error(`Could not save login startup: ${messageOf(error)}. The previous setting was restored.`, {
            cause: error,
          });
        }
        break;
      }
    }
    this.desktop.changed();
    return remoteWarning;
  }

  private async validateSelection(config: ScreenConfig, nodeId: string): Promise<void> {
    const screens = nodeId === this.identity.sourceId ? this.state.document.screens : this.peer(nodeId).desired;
    const previous = screens.find((screen) => screen.id === config.id);
    // A display can retain an authorized selection without retaining the controller's source connections.
    const preservesSubjects =
      previous?.view === config.view &&
      previous.selections.length === config.selections.length &&
      config.selections.every((selection, index) => {
        const saved = previous.selections[index]!;
        return (
          selection.sourceId === saved.sourceId &&
          selection.subjectId === saved.subjectId &&
          selection.follow === saved.follow
        );
      });
    const kindOf = (id?: string) =>
      this.state.document.sources.find((source) => source.id === id)?.catalog.identity.kind ??
      this.state.document.sourceIdentities.find((identity) => identity.sourceId === id)?.kind;
    const permitsDirectorSelection = (id?: string) =>
      kindOf(id) === 'director' || (kindOf(id) === undefined && preservesSubjects);
    if (config.view === 'ranking' || config.view === 'final') {
      if (config.selections.length !== 1 || !permitsDirectorSelection(config.selections[0]?.sourceId))
        throw new Error('Rankings and final summaries require one Director subject');
    }
    for (const selection of config.selections) {
      const source = this.state.document.sources.find((candidate) => candidate.id === selection.sourceId);
      const saved = this.state
        .getEntries()
        .some(
          (entry) => entry.snapshot.sourceId === selection.sourceId && entry.snapshot.subjectId === selection.subjectId,
        );
      if (!source && !saved && !preservesSubjects) throw new Error('Connect the selected source first');
      if (selection.follow === 'athlete' && !permitsDirectorSelection(selection.sourceId))
        throw new Error('Athlete tracking requires Director');
      const subject = source
        ? (this.sourceViews.get(source.id)?.catalog ?? source.catalog).subjects.find(
            (candidate) => candidate.id === selection.subjectId,
          )
        : undefined;
      // Saved subjects remain selectable while the source no longer advertises them.
      if ((!subject || subject.availability !== 'available') && !saved && !preservesSubjects)
        throw new Error(subject?.reason ?? 'The selected subject is unavailable');
    }
    if (
      previous?.standby &&
      !config.standby &&
      config.selections.length &&
      !config.selections.some((selection) =>
        this.resumableSubjects().some(
          (subject) => subject.sourceId === selection.sourceId && subject.subjectId === selection.subjectId,
        ),
      )
    ) {
      // A replacement controller may have no source cache while the display retains its finished results.
      const peer = nodeId === this.identity.sourceId ? null : this.peer(nodeId);
      const remote = peer
        ? NodeStateSchema.parse(
            await requestVista(peer.endpoint, peer.secret, 'GET', '/vista/v1/display/state', undefined, peer.id),
          )
        : null;
      if (
        !config.selections.some((selection) =>
          remote?.resumableSubjects.some(
            (subject) => subject.sourceId === selection.sourceId && subject.subjectId === selection.subjectId,
          ),
        )
      )
        throw new Error('The selected display has no current data or saved finished result. Standby was retained.');
    }
  }

  private peer(id: string) {
    const peer = this.state.document.peers.find((candidate) => candidate.id === id);
    if (!peer) throw new Error('Display PC is not paired');
    return peer;
  }

  private assertControllerRole(document = this.state.document): void {
    if (document.controller || document.releasing)
      throw new Error('This PC is managed remotely. Revoke control before managing other display PCs.');
  }

  private async handleRemote(method: string, path: string, input: unknown): Promise<unknown> {
    if (this.releaseTask || this.state.document.releasing) throw new Error('Display control is being released');
    const authoritySecret = this.state.document.secret;
    if (method === 'GET' && path === '/vista/v1/display/state') return this.node();
    if (method !== 'POST') throw new Error('Unsupported Vista operation');
    if (path === '/vista/v1/display/register') {
      await this.state.register(input, authoritySecret);
      return this.node();
    }
    const owner = OwnerSchema.parse(input);
    this.state.assertOwner(owner);
    if (path === '/vista/v1/display/apply') {
      const body = OwnerSchema.extend({ config: ScreenConfigSchema }).parse(input);
      await this.state.apply(body.config, this.desktop.monitors(), owner, authoritySecret);
      this.desktop.open(body.config);
    } else if (path === '/vista/v1/display/frame') await this.state.receiveFrame(input, authoritySecret);
    else if (path === '/vista/v1/display/identify' || path === '/vista/v1/display/remove') {
      const body = OwnerSchema.extend({ screenId: z.string().min(1) }).parse(input);
      if (path.endsWith('/identify')) {
        this.state.identifyScreen(body.screenId);
        this.desktop.open(this.state.document.screens.find((screen) => screen.id === body.screenId)!);
      } else {
        await this.state.remove(body.screenId, owner, authoritySecret);
        this.desktop.close(body.screenId);
      }
    } else if (path === '/vista/v1/display/release') {
      const persisted = this.state.transact((document) => {
        if (document.secret !== authoritySecret) throw new Error('The display pairing authority was revoked');
        this.state.assertOwner(owner);
        return { ...document, controller: null, releasing: true };
      });
      // Register the whole release before yielding so local revocation and
      // shutdown also wait for its pending persistence and listener cleanup.
      // Let the authenticated release acknowledgement leave before rotating the listener.
      this.releaseTask = persisted
        .then(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
        .then(async () => {
          this.discovery?.close();
          await this.server?.close();
          this.server = null;
          await this.state.transact((document) => ({
            ...document,
            controller: null,
            releasing: false,
            secret: randomBytes(32).toString('base64url'),
          }));
          if (!this.stopped) await this.listen();
        })
        .catch((error) => {
          this.error = messageOf(error);
          this.desktop.changed();
        })
        .finally(() => {
          this.releaseTask = null;
        });
      await persisted;
    } else throw new Error('Unsupported Vista operation');
    return this.node();
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    try {
      const tasks = this.state.document.sources.map((source) => ({
        key: `source:${source.id}`,
        run: async () => {
          const isCurrent = () => this.isCurrentSource(source);
          if (!isCurrent()) return;
          try {
            let catalog = this.sourceViews.get(source.id)?.catalog ?? source.catalog;
            if (Date.now() - (this.lastCatalog.get(source.id) ?? 0) > 5000) {
              catalog = VistaCatalogSchema.parse(
                await requestVista(source.endpoint, source.secret, 'GET', VISTA_CATALOG_PATH, undefined, source.id),
              );
              if (catalog.identity.sourceId !== source.id || catalog.identity.kind !== source.catalog.identity.kind)
                throw new Error('The source identity changed');
              if (!isCurrent()) return;
              this.lastCatalog.set(source.id, Date.now());
            }
            if (!isCurrent()) return;
            this.sourceViews.set(source.id, {
              id: source.id,
              endpoint: source.endpoint,
              catalog,
              state: 'connected',
              error: null,
            });
            const screens = [
              ...this.state.document.screens,
              ...this.state.document.peers.flatMap((peer) => [
                ...peer.desired,
                ...(this.peerViews.get(peer.id)?.node?.screens.map(({ config }) => config) ?? []),
              ]),
            ];
            const subjects = new Set(
              screens.flatMap((screen) =>
                screen.selections
                  .filter((selection) => selection.sourceId === source.id)
                  .map((selection) => selection.subjectId),
              ),
            );
            for (const subjectId of subjects) {
              try {
                await this.fetchSubject(source, subjectId);
              } catch (error) {
                if (!isCurrent()) return;
                const old = this.state
                  .getEntries()
                  .find((entry) => entry.snapshot.sourceId === source.id && entry.snapshot.subjectId === subjectId);
                if (old) await this.state.updateEntry({ ...old, state: 'stale', error: messageOf(error) }, isCurrent);
                if (!isCurrent()) return;
                this.sourceViews.set(source.id, {
                  id: source.id,
                  endpoint: source.endpoint,
                  catalog,
                  state: 'offline',
                  error: messageOf(error),
                });
              }
            }
          } catch (error) {
            if (!isCurrent()) return;
            this.sourceViews.set(source.id, {
              id: source.id,
              endpoint: source.endpoint,
              catalog: source.catalog,
              state: 'offline',
              error: messageOf(error),
            });
          }
        },
      }));
      tasks.push(
        ...this.state.document.peers.map((peer) => ({ key: `peer:${peer.id}`, run: () => this.syncPeer(peer.id) })),
      );
      for (const task of tasks) {
        if (this.activePolls.has(task.key)) continue;
        this.activePolls.add(task.key);
        const pending = task
          .run()
          .catch((error) => {
            this.error = messageOf(error);
          })
          .finally(() => {
            this.activePolls.delete(task.key);
            this.activeTasks.delete(pending);
          });
        this.activeTasks.add(pending);
      }
    } catch (error) {
      this.error = messageOf(error);
    }
    this.desktop.changed();
    if (!this.stopped) this.timer = setTimeout(() => void this.tick(), 200);
  }

  private peerQueues = new Map<string, Promise<unknown>>();
  private isCurrentSource(source: DisplayState['document']['sources'][number]): boolean {
    return (
      !this.state.document.controller && !this.state.document.releasing && this.state.document.sources.includes(source)
    );
  }

  private async fetchSubject(source: DisplayState['document']['sources'][number], subjectId: string): Promise<void> {
    if (!this.isCurrentSource(source)) return;
    const snapshot = VistaSnapshotSchema.parse(
      await requestVista(source.endpoint, source.secret, 'GET', vistaSnapshotPath(subjectId), undefined, source.id),
    );
    if (snapshot.sourceId !== source.id || snapshot.subjectId !== subjectId)
      throw new Error('Snapshot subject does not match the selection');
    if (source.catalog.identity.kind === 'lane' && snapshot.ranking)
      throw new Error('A Lane source must not provide rankings');
    const hasParticipants = snapshot.participants.length > 0;
    // Published competition results are reconfirmed by Director independently
    // of the completeness or availability of each Lane's target history.
    const confirmedPublication =
      source.catalog.identity.kind === 'director' && snapshot.ranking?.kind === 'competition';
    const stale =
      !confirmedPublication &&
      hasParticipants &&
      snapshot.participants.every((participant) => participant.dataState === 'stale');
    const incomplete =
      !confirmedPublication &&
      hasParticipants &&
      snapshot.participants.every((participant) => participant.dataState === 'stale' || !participant.historyComplete);
    await this.state.updateEntry(
      {
        snapshot,
        state: stale ? 'stale' : incomplete ? 'syncing' : 'live',
        receivedAt: Date.now(),
        error: stale
          ? 'The source cannot confirm current Lane data'
          : incomplete
            ? 'The source has not confirmed complete shooting history'
            : null,
      },
      () => this.isCurrentSource(source),
    );
  }
  private syncPeer(id: string): Promise<void> {
    return this.enqueuePeer(id, () => this.pushPeer(id));
  }
  private enqueuePeer(id: string, action: () => Promise<void>): Promise<void> {
    const operation = (this.peerQueues.get(id) ?? Promise.resolve()).catch(() => undefined).then(action);
    this.peerQueues.set(id, operation);
    return operation;
  }

  private async pushPeer(id: string): Promise<void> {
    const peer = this.state.document.peers.find((candidate) => candidate.id === id);
    if (!peer) return;
    try {
      this.assertControllerRole();
      let node = NodeStateSchema.parse(
        await requestVista(peer.endpoint, peer.secret, 'GET', '/vista/v1/display/state', undefined, peer.id),
      );
      node = NodeStateSchema.parse(
        await requestVista(peer.endpoint, peer.secret, 'POST', '/vista/v1/display/register', this.owner(), peer.id),
      );
      const screenErrors = new Map<string, string>();
      for (const config of peer.desired) {
        if (node.screens.find((screen) => screen.config.id === config.id)?.appliedRevision !== config.revision) {
          try {
            node = NodeStateSchema.parse(
              await requestVista(
                peer.endpoint,
                peer.secret,
                'POST',
                '/vista/v1/display/apply',
                { ...this.owner(), config },
                peer.id,
              ),
            );
          } catch (error) {
            screenErrors.set(config.id, messageOf(error));
          }
        }
      }
      // Failed configuration applies retain the display's previous selection.
      // Continue delivering to the configurations that are actually persisted.
      const selected = new Set(
        node.screens.flatMap(({ config }) =>
          config.selections.map((selection) => snapshotKey(selection.sourceId, selection.subjectId)),
        ),
      );
      const entries = this.state
        .getEntries()
        .filter((entry) => selected.has(snapshotKey(entry.snapshot.sourceId, entry.snapshot.subjectId)));
      const configs = node.screens.map(({ config }) => ({ id: config.id, revision: config.revision }));
      const signature = JSON.stringify({
        entries: entries.map((entry) => [
          entry.snapshot.sourceId,
          entry.snapshot.subjectId,
          entry.snapshot.revision,
          entry.state,
        ]),
        configs,
      });
      // Heartbeats still refresh source freshness. The receiver separately acknowledges actual rendering.
      if (
        this.peerSignatures.get(peer.id) !== signature ||
        Date.now() - (this.peerFrameAt.get(peer.id) ?? 0) > 1000 ||
        node.identity.bootId !== this.peerViews.get(peer.id)?.node?.identity.bootId
      ) {
        node = NodeStateSchema.parse(
          await requestVista(
            peer.endpoint,
            peer.secret,
            'POST',
            '/vista/v1/display/frame',
            { ...this.owner(), sequence: this.sequence++, configs, entries },
            peer.id,
          ),
        );
        this.peerSignatures.set(peer.id, signature);
        this.peerFrameAt.set(peer.id, Date.now());
      }
      this.peerScreenErrors.set(peer.id, screenErrors);
      this.peerViews.set(peer.id, { id: peer.id, endpoint: peer.endpoint, node, error: null });
    } catch (error) {
      this.peerViews.set(peer.id, {
        id: peer.id,
        endpoint: peer.endpoint,
        node: this.peerViews.get(peer.id)?.node ?? null,
        error: messageOf(error),
      });
    }
  }
}

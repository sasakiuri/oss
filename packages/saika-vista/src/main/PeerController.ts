// SPDX-License-Identifier: MIT
import { VISTA_PROTOCOL_VERSION, VistaIdentitySchema } from '@sasakiuri/saika-protocol/Vista';
import { requestVista } from '@sasakiuri/saika-protocol/vista-node';
import { z } from 'zod';

import { VISTA_DISPLAY_PATH } from '../shared/displayPaths';
import { ScreenConfigSchema, type NodeState, type PeerView, type ScreenConfig } from '../shared/model';

import type { DisplayState, OwnerSchema } from './DisplayState';
import { Endpoint, messageOf, snapshotKey, type Document } from './document';

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

type Peer = Document['peers'][number];

/**
 * Controls paired display PCs. Every request to one display PC that changes or relies on its
 * screens runs in that PC's queue, so a late response cannot undo a newer change.
 */
export class PeerController {
  private sequence = 0;
  private views = new Map<string, PeerView>();
  private screenErrors = new Map<string, Map<string, string>>();
  private signatures = new Map<string, string>();
  private frameAt = new Map<string, number>();
  private queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly state: DisplayState,
    private readonly localId: string,
  ) {}

  /** A saved display PC, which stays listed until it confirms the release. */
  peer(id: string): Peer {
    const peer = this.state.document.peers.find((candidate) => candidate.id === id);
    if (!peer) throw new Error('Display PC is not paired');
    return peer;
  }

  assertControllerRole(document = this.state.document): void {
    if (document.controller || document.releasing)
      throw new Error('This PC is managed remotely. Revoke control before managing other display PCs.');
  }

  /** The requested screens of each display PC together with the screens it last reported. */
  screens(): ScreenConfig[] {
    return this.state.document.peers.flatMap((peer) => [
      ...peer.desired,
      ...(this.views.get(peer.id)?.node?.screens.map(({ config }) => config) ?? []),
    ]);
  }

  /** The operator's view of each display PC: requested settings merged with its last confirmed state. */
  list(): PeerView[] {
    return this.state.document.peers.map((peer) => {
      const cached = this.views.get(peer.id);
      const view = cached?.node
        ? cached
        : {
            id: peer.id,
            endpoint: peer.endpoint,
            node: {
              identity: {
                protocolVersion: VISTA_PROTOCOL_VERSION,
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
              error: view.error ?? this.screenErrors.get(peer.id)?.get(config.id) ?? actual?.error ?? null,
            };
          }),
        },
      };
    });
  }

  /** Pairs a display PC and returns its storage warning. */
  async connect(endpointInput: string, secret: string): Promise<string | null> {
    this.assertControllerRole();
    const endpoint = Endpoint.parse(endpointInput);
    const node = NodeStateSchema.parse(await requestVista(endpoint, secret, 'GET', VISTA_DISPLAY_PATH.state));
    if (node.identity.kind !== 'display' || node.identity.sourceId === this.localId)
      throw new Error('Choose another Vista display PC');
    this.assertControllerRole();
    const registered = NodeStateSchema.parse(
      await requestVista(endpoint, secret, 'POST', VISTA_DISPLAY_PATH.register, this.owner(), node.identity.sourceId),
    );
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
              secret,
              desired:
                document.peers.find((peer) => peer.id === node.identity.sourceId && peer.secret === secret)?.desired ??
                node.screens.map((screen) => screen.config),
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
    this.views.set(node.identity.sourceId, {
      id: node.identity.sourceId,
      endpoint,
      node: registered,
      error: null,
    });
    return registered.persistenceError;
  }

  /** Releases a display PC and returns its storage warning. */
  async remove(id: string): Promise<string | null> {
    const peer = this.peer(id);
    // A disconnected peer remains listed until revocation reaches the actual device.
    const released = NodeStateSchema.parse(
      await requestVista(peer.endpoint, peer.secret, 'POST', VISTA_DISPLAY_PATH.release, this.owner(), peer.id),
    );
    await this.state.transact((document) => ({
      ...document,
      peers: document.peers.filter((saved) => saved.id !== peer.id),
    }));
    this.views.delete(peer.id);
    this.screenErrors.delete(peer.id);
    return released.persistenceError;
  }

  /** Saves a screen for a display PC, delivers it and returns its storage warning. */
  async apply(id: string, config: ScreenConfig): Promise<string | null> {
    const peer = this.peer(id);
    const previous = peer.desired.find((screen) => screen.id === config.id);
    if (previous && config.revision <= previous.revision)
      throw new Error('Refresh the screen editor before applying a new revision');
    await this.state.transact((document) => ({
      ...document,
      peers: document.peers.map((saved) =>
        saved.id !== peer.id
          ? saved
          : {
              ...saved,
              desired: [...saved.desired.filter((screen) => screen.id !== config.id), config],
            },
      ),
    }));
    await this.sync(peer.id);
    const error = this.views.get(peer.id)?.error ?? this.screenErrors.get(peer.id)?.get(config.id);
    if (error) throw new Error(error);
    return this.views.get(peer.id)?.node?.persistenceError ?? null;
  }

  /** Shows the identification overlay on a display PC's screen and returns its storage warning. */
  async identify(id: string, screenId: string): Promise<string | null> {
    this.assertControllerRole();
    const peer = this.peer(id);
    const identified = NodeStateSchema.parse(
      await requestVista(
        peer.endpoint,
        peer.secret,
        'POST',
        VISTA_DISPLAY_PATH.identify,
        { ...this.owner(), screenId },
        peer.id,
      ),
    );
    return identified.persistenceError;
  }

  /** Removes a screen from a display PC and returns its storage warning. */
  async removeScreen(id: string, screenId: string): Promise<string | null> {
    this.assertControllerRole();
    let warning: string | null = null;
    await this.enqueue(id, async () => {
      const peer = this.peer(id);
      const removed = NodeStateSchema.parse(
        await requestVista(
          peer.endpoint,
          peer.secret,
          'POST',
          VISTA_DISPLAY_PATH.remove,
          { ...this.owner(), screenId },
          peer.id,
        ),
      );
      warning = removed.persistenceError;
      await this.state.transact((document) => ({
        ...document,
        peers: document.peers.map((saved) =>
          saved.id !== peer.id
            ? saved
            : { ...saved, desired: saved.desired.filter((screen) => screen.id !== screenId) },
        ),
      }));
    });
    return warning;
  }

  /** The current state reported by a display PC. */
  async fetchNode(id: string): Promise<NodeState> {
    const peer = this.peer(id);
    return NodeStateSchema.parse(
      await requestVista(peer.endpoint, peer.secret, 'GET', VISTA_DISPLAY_PATH.state, undefined, peer.id),
    );
  }

  /** Queues delivery of the requested screens and selected data to a display PC. */
  sync(id: string): Promise<void> {
    return this.enqueue(id, () => this.push(id));
  }

  private owner(): z.infer<typeof OwnerSchema> {
    return { controllerId: this.localId, controllerGeneration: this.state.document.generation };
  }

  private enqueue(id: string, action: () => Promise<void>): Promise<void> {
    const operation = (this.queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(action);
    this.queues.set(id, operation);
    return operation;
  }

  private async push(id: string): Promise<void> {
    const peer = this.state.document.peers.find((candidate) => candidate.id === id);
    if (!peer) return;
    try {
      this.assertControllerRole();
      let node = NodeStateSchema.parse(
        await requestVista(peer.endpoint, peer.secret, 'GET', VISTA_DISPLAY_PATH.state, undefined, peer.id),
      );
      node = NodeStateSchema.parse(
        await requestVista(peer.endpoint, peer.secret, 'POST', VISTA_DISPLAY_PATH.register, this.owner(), peer.id),
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
                VISTA_DISPLAY_PATH.apply,
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
        this.signatures.get(peer.id) !== signature ||
        Date.now() - (this.frameAt.get(peer.id) ?? 0) > 1000 ||
        node.identity.bootId !== this.views.get(peer.id)?.node?.identity.bootId
      ) {
        node = NodeStateSchema.parse(
          await requestVista(
            peer.endpoint,
            peer.secret,
            'POST',
            VISTA_DISPLAY_PATH.frame,
            { ...this.owner(), sequence: this.sequence++, configs, entries },
            peer.id,
          ),
        );
        this.signatures.set(peer.id, signature);
        this.frameAt.set(peer.id, Date.now());
      }
      this.screenErrors.set(peer.id, screenErrors);
      this.views.set(peer.id, { id: peer.id, endpoint: peer.endpoint, node, error: null });
    } catch (error) {
      this.views.set(peer.id, {
        id: peer.id,
        endpoint: peer.endpoint,
        node: this.views.get(peer.id)?.node ?? null,
        error: messageOf(error),
      });
    }
  }
}

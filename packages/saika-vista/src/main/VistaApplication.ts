// SPDX-License-Identifier: MIT
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { VISTA_PROTOCOL_VERSION, type VistaIdentity } from '@sasakiuri/saika-protocol/Vista';
import { discoverVistaNodes } from '@sasakiuri/saika-protocol/vista-node';

import { CommandSchema, type AppState, type Command, type NodeState, type ScreenConfig } from '../shared/model';

import { AtomicStore } from './AtomicStore';
import type { DesktopPort } from './DesktopPort';
import { DisplayServer } from './DisplayServer';
import { DisplayState } from './DisplayState';
import { DocumentSchema, messageOf, newDocument } from './document';
import { PeerController } from './PeerController';
import { SourceAcquisition } from './SourceAcquisition';

/** Composition of source acquisition, durable display state and authenticated peer control. */
export class VistaApplication {
  readonly identity: VistaIdentity;
  readonly state: DisplayState;
  private readonly sources: SourceAcquisition;
  private readonly peers: PeerController;
  private readonly display: DisplayServer;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private error: string | null = null;
  private loginStartError: string | null = null;
  private commandQueue: Promise<unknown> = Promise.resolve();
  private activePolls = new Set<string>();
  private activeTasks = new Set<Promise<void>>();
  /** The renderer-visible state that the operator and audience windows were last asked to refetch. */
  private notified: string | null = null;

  private constructor(
    state: DisplayState,
    private readonly desktop: DesktopPort,
  ) {
    this.state = state;
    this.identity = {
      protocolVersion: VISTA_PROTOCOL_VERSION,
      sourceId: state.document.id,
      bootId: randomUUID(),
      kind: 'display',
      name: state.document.name,
    };
    this.peers = new PeerController(state, this.identity.sourceId);
    this.sources = new SourceAcquisition(state, () => [...this.state.document.screens, ...this.peers.screens()]);
    this.display = new DisplayServer(this.identity, state, desktop, {
      node: () => this.node(),
      releaseFailed: (error) => {
        this.error = messageOf(error);
        this.notifyIfChanged();
      },
    });
  }

  static async start(directory: string, desktop: DesktopPort): Promise<VistaApplication> {
    const store = new AtomicStore(join(directory, 'vista.json'), DocumentSchema);
    const document = await store.read(newDocument);
    // Changes before the application exists have no renderer to notify.
    let changed = (): void => undefined;
    const state = new DisplayState(document, store, () => changed());
    await state.transact((current) => ({
      ...current,
      generation: current.generation + 1,
      ...(current.releasing
        ? { controller: null, releasing: false, secret: randomBytes(32).toString('base64url') }
        : {}),
    }));
    const application = new VistaApplication(state, desktop);
    changed = () => application.notifyIfChanged();
    await application.display.listen();
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

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.display.stop();
    await Promise.allSettled([...this.activeTasks]);
    await this.commandQueue.catch(() => undefined);
    await this.state.flush();
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
      endpoints: this.display.endpoints,
      pairingSecret: this.state.document.secret,
      sources: this.sources.list(),
      peers: this.peers.list(),
      snapshots: this.state.getEntries(),
      error:
        [this.display.error, this.loginStartError, this.error, this.state.persistenceError, this.state.snapshotErrors()]
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
      case 'inspectSubject':
        await this.sources.inspect(command.sourceId, command.subjectId);
        break;
      case 'connectSource':
        await this.sources.connect(command.endpoint, command.secret);
        break;
      case 'removeSource':
        await this.sources.remove(command.id);
        break;
      case 'connectPeer':
        remoteWarning = await this.peers.connect(command.endpoint, command.secret);
        break;
      case 'removePeer':
        remoteWarning = await this.peers.remove(command.id);
        break;
      case 'apply': {
        if (command.nodeId !== this.identity.sourceId) this.peers.assertControllerRole();
        await this.validateSelection(command.config, command.nodeId);
        if (command.nodeId === this.identity.sourceId) {
          await this.state.apply(command.config, this.desktop.monitors());
          this.desktop.open(command.config);
        } else remoteWarning = await this.peers.apply(command.nodeId, command.config);
        break;
      }
      case 'identify': {
        if (command.nodeId === this.identity.sourceId) {
          this.state.identifyScreen(command.screenId);
          const config = this.state.document.screens.find((screen) => screen.id === command.screenId)!;
          this.desktop.open(config);
        } else remoteWarning = await this.peers.identify(command.nodeId, command.screenId);
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
        } else remoteWarning = await this.peers.removeScreen(command.nodeId, command.screenId);
        break;
      }
      case 'revokeController':
        await this.display.revoke();
        break;
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
    this.notifyIfChanged();
    return remoteWarning;
  }

  private async validateSelection(config: ScreenConfig, nodeId: string): Promise<void> {
    const screens = nodeId === this.identity.sourceId ? this.state.document.screens : this.peers.peer(nodeId).desired;
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
        ? this.sources.catalog(source).subjects.find((candidate) => candidate.id === selection.subjectId)
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
      const remote = nodeId === this.identity.sourceId ? null : await this.peers.fetchNode(nodeId);
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

  /**
   * Asks the operator and audience windows to refetch when the state they read differs from the state they were
   * last asked to refetch. That is view() and each screen's audience(), whose entries are a subset of view().
   * DisplayState replaces an entry's snapshot only at a higher revision or with the same content, so the revision
   * stands for the content. The renderers judge freshness against their own clock from receivedAt, so a poll that
   * only refreshes an unchanged entry's freshness notifies once that time reaches a new second, not on every poll.
   */
  private notifyIfChanged(): void {
    const view = this.view();
    const signature = JSON.stringify({
      ...view,
      snapshots: view.snapshots.map(({ snapshot, state, error, receivedAt }) => [
        Math.floor(receivedAt / 1000),
        snapshot.sourceId,
        snapshot.subjectId,
        snapshot.generation,
        snapshot.revision,
        state,
        error,
      ]),
      identifyUntil: this.state.document.screens.map((config) => this.state.identifyUntil(config.id)),
    });
    if (signature === this.notified) return;
    this.notified = signature;
    this.desktop.changed();
  }

  /** Starts one poll per source and display PC unless its previous poll is still running; repeats every 200 ms. */
  private async tick(): Promise<void> {
    if (this.stopped) return;
    try {
      const tasks = [
        ...this.state.document.sources.map((source) => ({
          key: `source:${source.id}`,
          run: () => this.sources.poll(source),
        })),
        ...this.state.document.peers.map((peer) => ({ key: `peer:${peer.id}`, run: () => this.peers.sync(peer.id) })),
      ];
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
    try {
      this.notifyIfChanged();
    } finally {
      // A failed notification must not end polling.
      if (!this.stopped) this.timer = setTimeout(() => void this.tick(), 200);
    }
  }
}

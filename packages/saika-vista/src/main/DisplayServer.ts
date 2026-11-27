// SPDX-License-Identifier: MIT
import type { VistaIdentity } from '@sasakiuri/saika-protocol/Vista';
import { createVistaHost, type VistaServer } from '@sasakiuri/saika-protocol/vista-node';
import { z } from 'zod';

import { VISTA_DISPLAY_PATH } from '../shared/displayPaths';
import { ScreenConfigSchema, type NodeState } from '../shared/model';

import type { DesktopPort } from './DesktopPort';
import { OwnerSchema, type DisplayState } from './DisplayState';
import { messageOf, withoutController } from './document';

/**
 * Serves this PC's screens to its controlling Vista and advertises it for discovery. Releasing or
 * revoking control rotates the pairing secret and restarts the listener.
 */
export class DisplayServer {
  private server: VistaServer | null = null;
  private releaseTask: Promise<void> | null = null;
  private listenerError: string | null = null;
  private stopped = false;

  constructor(
    private readonly identity: VistaIdentity,
    private readonly state: DisplayState,
    private readonly desktop: DesktopPort,
    private readonly options: {
      /** This PC's current state, returned by every display request. */
      node(): NodeState;
      /** Reports a failure to finish a remote release after it was acknowledged. */
      releaseFailed(error: unknown): void;
    },
  ) {}

  get endpoints(): string[] {
    return this.server?.endpoints ?? [];
  }

  /** Why controllers cannot connect to this PC, if the listener could not start. */
  get error(): string | null {
    return this.listenerError;
  }

  async listen(): Promise<void> {
    try {
      this.server = await createVistaHost({
        identity: this.identity,
        secret: () => this.state.document.secret,
        port: this.state.document.port,
        handle: (method, path, body) => this.handle(method, path, body),
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
    await this.releaseTask;
    await this.server?.close();
  }

  /** Revokes the controller locally with a new pairing secret and restarts the listener. */
  async revoke(): Promise<void> {
    await this.releaseTask;
    await this.server?.close();
    await this.state.transact(withoutController);
    await this.listen();
  }

  private async handle(method: string, path: string, input: unknown): Promise<unknown> {
    this.state.assertNotReleasing(this.releaseTask !== null);
    const authoritySecret = this.state.document.secret;
    if (method === 'GET' && path === VISTA_DISPLAY_PATH.state) return this.options.node();
    if (method !== 'POST') throw new Error('Unsupported Vista operation');
    if (path === VISTA_DISPLAY_PATH.register) {
      await this.state.register(input, authoritySecret);
      return this.options.node();
    }
    const owner = OwnerSchema.parse(input);
    this.state.assertOwner(owner);
    if (path === VISTA_DISPLAY_PATH.apply) {
      const body = OwnerSchema.extend({ config: ScreenConfigSchema }).parse(input);
      await this.state.apply(body.config, this.desktop.monitors(), owner, authoritySecret);
      this.desktop.open(body.config);
    } else if (path === VISTA_DISPLAY_PATH.frame) await this.state.receiveFrame(input, authoritySecret);
    else if (path === VISTA_DISPLAY_PATH.identify || path === VISTA_DISPLAY_PATH.remove) {
      const body = OwnerSchema.extend({ screenId: z.string().min(1) }).parse(input);
      if (path === VISTA_DISPLAY_PATH.identify) {
        this.desktop.open(this.state.identifyScreen(body.screenId));
      } else {
        await this.state.remove(body.screenId, owner, authoritySecret);
        this.desktop.close(body.screenId);
      }
    } else if (path === VISTA_DISPLAY_PATH.release) {
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
          await this.server?.close();
          this.server = null;
          await this.state.transact(withoutController);
          if (!this.stopped) await this.listen();
        })
        .catch((error) => this.options.releaseFailed(error))
        .finally(() => {
          this.releaseTask = null;
        });
      await persisted;
    } else throw new Error('Unsupported Vista operation');
    return this.options.node();
  }
}

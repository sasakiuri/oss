// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { app } from 'electron';
import { createVistaDiscovery, createVistaServer, loadVistaCredentials } from '@sasakiuri/saika-protocol/vista-node';
import { VISTA_CATALOG_PATH, type VistaIdentity } from '@sasakiuri/saika-protocol/Vista';
import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { ResultBoardSnapshotService, ResultPublicationService } from '@/main/modules/result-publication';
import { vistaContract } from '@/shared/ipc/contracts/vista.contract';
import { Logger } from '@/shared/utils/Logger';
import { DirectorVistaSource } from './application/DirectorVistaSource';

const logger = Logger.create('vista');
export const vistaModule: ModuleDefinition<
  | 'database'
  | 'eventBus'
  | 'ipcRouter'
  | 'appConfigService'
  | 'competitionTypeRegistry'
  | 'competitionShotJournal'
  | 'resultVerificationService'
  | 'resultPublicationRepository'
  | 'resultPublicationReadiness'
  | 'resultPublicationPolicyResolver'
  | 'finalResultDeclarationService'
  | 'qualificationResultsReader'
  | 'finalResultsReader'
> = {
  name: 'vista',
  deps: [
    'database',
    'eventBus',
    'ipcRouter',
    'appConfigService',
    'competitionTypeRegistry',
    'competitionShotJournal',
    'resultVerificationService',
    'resultPublicationRepository',
    'resultPublicationReadiness',
    'resultPublicationPolicyResolver',
    'finalResultDeclarationService',
    'qualificationResultsReader',
    'finalResultsReader',
  ],
  register(ctx) {
    let credentials: ReturnType<typeof loadVistaCredentials>;
    try {
      credentials = loadVistaCredentials(join(app.getPath('userData'), 'vista', 'credentials.json'));
    } catch (caught) {
      const error = `Vista credentials are unavailable: ${caught instanceof Error ? caught.message : String(caught)}`;
      logger.error(error);
      const unavailable = () => ({
        enabled: ctx.appConfigService.get('vista.enabled'),
        port: ctx.appConfigService.get('vista.port'),
        running: false,
        endpoints: [],
        sourceId: '',
        pairingSecret: '',
        error,
      });
      ctx.ipcRouter.register(vistaContract, {
        getSettings: async () => unavailable(),
        setSettings: async (input) => {
          if (input.enabled) throw new Error(error);
          ctx.appConfigService.setMany({ 'vista.enabled': false, 'vista.port': input.port });
          return unavailable();
        },
      });
      return;
    }
    const identity: VistaIdentity = {
      protocolVersion: 1,
      sourceId: credentials.sourceId,
      bootId: randomUUID(),
      kind: 'director',
      name: 'Saika Director',
    };
    const boards = new ResultBoardSnapshotService(
      ctx.resultVerificationService,
      new ResultPublicationService(
        ctx.resultPublicationRepository,
        ctx.resultPublicationReadiness,
        ctx.resultPublicationPolicyResolver,
      ),
      ctx.finalResultDeclarationService,
    );
    const source = new DirectorVistaSource(
      ctx.database,
      ctx.competitionTypeRegistry,
      ctx.competitionShotJournal,
      boards,
      identity,
      Date.now,
      async (eventId, final) =>
        final
          ? ctx.finalResultsReader.getDisplayByEvent(eventId)
          : ctx.qualificationResultsReader.getDisplayByEvent(eventId),
    );
    let projectionError: string | null = null;
    const unsubscribe = ctx.eventBus.on('MqttControlStateChanged', (event) => {
      try {
        source.observe(event.snapshot);
        projectionError = null;
      } catch (caught) {
        projectionError = `Vista source persistence failed: ${caught instanceof Error ? caught.message : String(caught)}`;
        logger.error(projectionError);
      }
    });
    let server: Awaited<ReturnType<typeof createVistaServer>> | null = null;
    let discovery: ReturnType<typeof createVistaDiscovery> | null = null;
    let error: string | null = null;
    let tail: Promise<void> = Promise.resolve();
    const stop = async () => {
      discovery?.close();
      discovery = null;
      const closing = server;
      server = null;
      await closing?.close();
    };
    const start = async (port: number) => {
      server = await createVistaServer({
        identity,
        secret: credentials.secret,
        port,
        handle: (method, path) => {
          if (projectionError) throw new Error(projectionError);
          if (method !== 'GET') throw new Error('Vista source accepts read requests only');
          if (path === VISTA_CATALOG_PATH) return source.catalog();
          const match = /^\/vista\/v1\/snapshot\/([^/]+)$/.exec(path);
          if (match) return source.snapshot(decodeURIComponent(match[1]!));
          throw new Error('Unknown Vista read endpoint');
        },
      });
      discovery = createVistaDiscovery(identity, server.port);
      error = null;
    };
    const settings = () => ({
      enabled: ctx.appConfigService.get('vista.enabled'),
      port: ctx.appConfigService.get('vista.port'),
      running: server !== null,
      endpoints: server?.endpoints ?? [],
      sourceId: identity.sourceId,
      pairingSecret: credentials.secret,
      error: error ?? projectionError,
    });
    ctx.ipcRouter.register(vistaContract, {
      getSettings: async () => settings(),
      setSettings: (input) => {
        const result = tail.then(async () => {
          const previous = settings();
          await stop();
          try {
            if (input.enabled) await start(input.port);
            ctx.appConfigService.setMany({ 'vista.enabled': input.enabled, 'vista.port': input.port });
            error = null;
          } catch (caught) {
            // A listener can already be running when saving its settings fails.
            // Close that listener before replacing the reference during rollback.
            await stop();
            if (previous.running) {
              try {
                await start(previous.port);
              } catch {
                /* The settings screen reports the unavailable listener. */
              }
            }
            error = caught instanceof Error ? caught.message : String(caught);
            throw caught;
          }
          return settings();
        });
        tail = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    });
    return {
      lifecycle: [
        {
          name: 'vista',
          start: async () => {
            if (!ctx.appConfigService.get('vista.enabled')) return;
            try {
              await start(ctx.appConfigService.get('vista.port'));
            } catch (caught) {
              error = caught instanceof Error ? caught.message : String(caught);
              logger.error('Vista listener could not start', caught);
            }
          },
          stop: async () => {
            unsubscribe();
            await tail;
            await stop();
          },
        },
      ],
    };
  },
};

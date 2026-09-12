// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { VistaIdentity } from '@sasakiuri/saika-protocol/Vista';
import {
  createVistaDiscovery,
  createVistaServer,
  loadVistaCredentials,
  rotateVistaCredentials,
  type VistaServer,
} from '@sasakiuri/saika-protocol/vista-node';

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { vistaContract } from '@/shared/ipc/contracts/vista.contract';

import { LaneVistaShotContextReader } from './infra/LaneVistaShotContextReader';
import { LaneVistaSource } from './infra/LaneVistaSource';

type Deps =
  | 'database'
  | 'userDataPath'
  | 'storage'
  | 'competitionRepository'
  | 'sessionRepository'
  | 'timerService'
  | 'competitionInterruptionControl'
  | 'competitionShootOffControl'
  | 'ipcRouter'
  | 'eventBus'
  | 'mainWindow';

export const vistaModule: ModuleDefinition<Deps> = {
  name: 'vista',
  deps: [
    'database',
    'userDataPath',
    'storage',
    'competitionRepository',
    'sessionRepository',
    'timerService',
    'competitionInterruptionControl',
    'competitionShootOffControl',
    'ipcRouter',
    'eventBus',
    'mainWindow',
  ],
  register({
    database,
    userDataPath,
    storage,
    competitionRepository,
    sessionRepository,
    timerService,
    competitionInterruptionControl,
    competitionShootOffControl,
    ipcRouter,
    eventBus,
    mainWindow,
  }) {
    let credentials: ReturnType<typeof loadVistaCredentials>;
    let identity: VistaIdentity;
    let source: LaneVistaSource;
    try {
      credentials = loadVistaCredentials(join(userDataPath, 'vista', 'credentials.json'));
      identity = {
        protocolVersion: 1,
        sourceId: credentials.sourceId,
        bootId: randomUUID(),
        kind: 'lane',
        name:
          storage.get<string>('mqtt.laneAlias') ||
          `Saika Lane ${storage.get<{ laneNumber?: number }>('userPreferences')?.laneNumber ?? 1}`,
      };
      const shotContexts = new LaneVistaShotContextReader(database);
      source = new LaneVistaSource({
        identity,
        directory: join(userDataPath, 'vista', 'snapshots'),
        storage,
        competitions: competitionRepository,
        sessions: sessionRepository,
        timer: timerService,
        readShotContexts: (competitionId, sessionId) => shotContexts.read(competitionId, sessionId),
        interruptions: competitionInterruptionControl,
        shootOffs: competitionShootOffControl,
        readShootOffSeries: (competitionId, sessionId) => shotContexts.readShootOffSeries(competitionId, sessionId),
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'Vista source initialization failed';
      const unavailable = { enabled: false, sourceId: '', secret: '', endpoints: [], error };
      ipcRouter.register(vistaContract, {
        getStatus: async () => unavailable,
        resetPairing: async () => {
          throw new Error(error);
        },
        setEnabled: async ({ enabled }) => {
          if (enabled) throw new Error(error);
          storage.set('vista.enabled', false);
          return unavailable;
        },
      });
      return;
    }
    let server: VistaServer | null = null;
    let discovery: { close(): void } | null = null;
    let error: string | null = null;
    let disposed = false;
    let changes = Promise.resolve();
    const status = () => ({
      enabled: server !== null,
      sourceId: identity.sourceId,
      secret: credentials.secret,
      endpoints: server?.endpoints ?? [],
      error: error ?? source.getError(),
    });
    const configure = (enabled: boolean, resetPairing = false): Promise<void> => {
      const next = changes.then(async () => {
        if (disposed) return;
        error = null;
        discovery?.close();
        discovery = null;
        if (server) {
          await server.close();
          server = null;
        }
        if (resetPairing) credentials = rotateVistaCredentials(join(userDataPath, 'vista', 'credentials.json'));
        if (enabled) {
          server = await createVistaServer({
            identity,
            secret: () => credentials.secret,
            port: 45831,
            handle: (method, path) => source.handle(method, path),
          });
          if (disposed) {
            await server.close();
            server = null;
            return;
          }
          discovery = createVistaDiscovery(identity, server.port);
        }
        storage.set('vista.enabled', enabled);
      });
      changes = next.catch((cause: unknown) => {
        error = cause instanceof Error ? cause.message : 'Vista source failed';
      });
      return next;
    };
    ipcRouter.register(vistaContract, {
      getStatus: async () => status(),
      resetPairing: async () => {
        await configure(server !== null, true);
        return status();
      },
      setEnabled: async ({ enabled }) => {
        await configure(enabled);
        return status();
      },
    });
    const refresh = (competitionId?: string) => {
      void source.refresh(competitionId).catch(() => {
        /* Persistence failure is shown by getStatus. */
      });
    };
    const refreshCompetition = (event: { aggregateId: string }) => refresh(event.aggregateId);
    const refreshSession = (event: { aggregateId: string }) => {
      void competitionRepository.findBySessionId(event.aggregateId).then(
        (competition) => refresh(competition?.id),
        () => refresh(),
      );
    };
    const unsubscribe = [
      eventBus.on('ShotRecorded', refreshSession),
      eventBus.on('SessionReset', refreshSession),
      eventBus.on('ModeSwitched', refreshSession),
      eventBus.on('CompetitionStarted', refreshCompetition),
      eventBus.on('CompetitionFinished', refreshCompetition),
      eventBus.on('PhaseChanged', refreshCompetition),
      eventBus.on('StageAdvanced', refreshCompetition),
      eventBus.on('TimerTick', refreshCompetition),
      eventBus.on('CompetitionInterruptionChanged', refreshCompetition),
    ];
    refresh();
    if (storage.get<boolean>('vista.enabled') === true)
      void configure(true).catch(() => {
        /* Shown in settings. */
      });
    mainWindow.once('closed', () => {
      disposed = true;
      for (const stop of unsubscribe) stop();
      discovery?.close();
      void server?.close();
    });
  },
};

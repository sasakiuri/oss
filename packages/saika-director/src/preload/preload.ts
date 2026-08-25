import { contextBridge } from 'electron';
import {
  championshipContract,
  laneControlContract,
  resultsContract,
  boardContract,
  shootoffContract,
  mqttContract,
  debugContract,
  eventsContract,
} from '@/shared/ipc/contracts';
import type { ElectronAPI } from '@/shared/types/ElectronAPI';
import { buildProcedureBridge, buildEventBridge, buildAliasedBridge } from './buildPreloadAPI';

declare const __APP_VERSION__: string;

const electronAPI: ElectronAPI = {
  appVersion: __APP_VERSION__,
  queries: buildProcedureBridge(debugContract),
  mqtt: buildProcedureBridge(mqttContract),

  // Championship uses aliased method names for 5 CRUD operations
  championship: buildAliasedBridge(championshipContract, {
    createChampionship: 'create',
    updateChampionship: 'update',
    deleteChampionship: 'delete',
    getChampionships: 'getAll',
    getChampionshipDetail: 'getDetail',
  }) as unknown as ElectronAPI['championship'],

  laneControl: buildProcedureBridge(laneControlContract),
  results: buildProcedureBridge(resultsContract),
  board: buildProcedureBridge(boardContract),
  shootoff: buildProcedureBridge(shootoffContract),
  on: buildEventBridge(eventsContract),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// SPDX-License-Identifier: MIT
import { contextBridge } from 'electron';

import { buildPreloadAPI } from './buildPreloadAPI';

/**
 * Preload script
 *
 * Exposes the type-safe ElectronAPI to the Renderer Process
 * using contract-generated bridges.
 */
const electronAPI = buildPreloadAPI();

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

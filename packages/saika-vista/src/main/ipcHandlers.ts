// SPDX-License-Identifier: MIT
import type { UpdaterService } from '@sasakiuri/saika-updater/main';
import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { z } from 'zod';

import { VISTA_CHANNEL } from '../shared/ipcChannels';

import type { OutputWindows } from './OutputWindows';
import type { VistaApplication } from './VistaApplication';

/** Registers the operator and audience handlers. */
export function registerIpcHandlers({
  application,
  operator,
  updating,
  updater,
  outputs,
}: {
  /** The running application; throws while Vista is starting. */
  application: () => VistaApplication;
  /** The operator window's web contents while that window exists. */
  operator: () => WebContents | undefined;
  /** Whether Vista is shutting down to install an update. */
  updating: () => boolean;
  updater: Pick<UpdaterService, 'getState' | 'checkForUpdates' | 'quitAndInstall'>;
  outputs: OutputWindows;
}): void {
  const isMainFrame = (event: IpcMainInvokeEvent) => event.senderFrame === event.sender.mainFrame;
  const requireOperator = (event: IpcMainInvokeEvent) => {
    if (!isMainFrame(event) || event.sender !== operator())
      throw new Error('This operation requires the local operator window');
    if (updating()) throw new Error('Vista is restarting to install an update.');
    return application();
  };
  const audienceScreen = (event: IpcMainInvokeEvent) => {
    const id = outputs.screenOf(event.sender);
    if (!isMainFrame(event) || id === undefined) throw new Error('This operation requires an audience window');
    return id;
  };
  ipcMain.handle(VISTA_CHANNEL.state, (event) => requireOperator(event).view());
  ipcMain.handle(VISTA_CHANNEL.command, (event, input: unknown) => requireOperator(event).command(input));
  ipcMain.handle(VISTA_CHANNEL.discover, (event) => requireOperator(event).discover());
  ipcMain.handle(VISTA_CHANNEL.updatesState, (event) => {
    requireOperator(event);
    return updater.getState();
  });
  ipcMain.handle(VISTA_CHANNEL.updatesCheck, (event) => {
    requireOperator(event);
    return updater.checkForUpdates();
  });
  ipcMain.handle(VISTA_CHANNEL.updatesInstall, (event) => {
    requireOperator(event);
    return updater.quitAndInstall();
  });
  ipcMain.handle(VISTA_CHANNEL.audience, (event) => application().state.audience(audienceScreen(event)));
  ipcMain.handle(VISTA_CHANNEL.rendered, (event, input: unknown) => {
    const id = audienceScreen(event);
    const revision = z.number().int().positive().parse(input);
    if (application().state.document.screens.find((config) => config.id === id)?.revision !== revision) return;
    outputs.rendered(id, revision);
  });
}

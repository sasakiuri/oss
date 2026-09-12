// SPDX-License-Identifier: MIT
/**
 * Updater IPC Contract
 *
 * Defines Zod-based contracts for application update checks and installation.
 */

import { AppUpdateStateSchema } from '@sasakiuri/saika-updater';

import {
  command,
  commandDataResponseSchema,
  CommandResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '../defineContract';

export { AppUpdateStateSchema } from '@sasakiuri/saika-updater';
export type { AppUpdateStateDto, AppUpdateStatus } from '@sasakiuri/saika-updater';

export const updaterContract = defineContract('updater', {
  getUpdateState: query(queryResponseSchema(AppUpdateStateSchema), {
    channel: 'updater:get-update-state',
  }),
  checkForUpdates: command(commandDataResponseSchema(AppUpdateStateSchema), {
    channel: 'updater:check-for-updates',
  }),
  quitAndInstall: command(CommandResponseSchema, {
    channel: 'updater:quit-and-install',
  }),
});

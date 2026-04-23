// SPDX-License-Identifier: MIT
/**
 * Updater IPC Contract
 *
 * @description
 * Defines Zod-based contracts for application update checks and installation.
 */

import { z } from 'zod';

import {
  command,
  commandDataResponseSchema,
  CommandResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '../defineContract';

export const AppUpdateStatusSchema = z.enum([
  'unsupported',
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'no-update',
  'error',
]);

export const AppUpdateStateSchema = z.object({
  status: AppUpdateStatusSchema,
  currentVersion: z.string(),
  targetVersion: z.string().nullable(),
  releaseName: z.string().nullable(),
  releaseDate: z.string().nullable(),
  releaseNotes: z.string().nullable(),
  downloadPercent: z.number().min(0).max(100).nullable(),
  transferredBytes: z.number().nonnegative().nullable(),
  totalBytes: z.number().nonnegative().nullable(),
  bytesPerSecond: z.number().nonnegative().nullable(),
  lastCheckedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  canCheckForUpdates: z.boolean(),
  canInstallUpdate: z.boolean(),
});

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

export type AppUpdateStatus = z.infer<typeof AppUpdateStatusSchema>;
export type AppUpdateStateDto = z.infer<typeof AppUpdateStateSchema>;

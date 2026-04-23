// SPDX-License-Identifier: MIT
/**
 * Window IPC Contract
 *
 * @description
 * Defines Zod-based contracts for window-related IPC channels.
 * Covers window operations such as fullscreen toggle, minimize, maximize, close.
 */

import { z } from 'zod';

import {
  CommandResponseSchema,
  command,
  commandDataResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '../defineContract';

// ============================================================
// DTO schemas
// ============================================================

const FullscreenStateDtoSchema = z.object({
  isFullscreen: z.boolean(),
});

const WindowStateDtoSchema = z.object({
  isMaximized: z.boolean(),
  isFullscreen: z.boolean(),
});

// ============================================================
// Custom response schemas
// ============================================================

const ToggleFullscreenResponseSchema = commandDataResponseSchema(FullscreenStateDtoSchema);
const MaximizeResponseSchema = commandDataResponseSchema(WindowStateDtoSchema);
const GetWindowStateResponseSchema = queryResponseSchema(WindowStateDtoSchema);

// ============================================================
// Contract definition
// ============================================================

export const windowContract = defineContract('window', {
  toggleFullscreen: command(ToggleFullscreenResponseSchema, {
    channel: 'command:toggleFullscreen',
  }),
  minimize: command(CommandResponseSchema, { channel: 'command:minimize' }),
  maximize: command(MaximizeResponseSchema, { channel: 'command:maximize' }),
  close: command(CommandResponseSchema, { channel: 'command:close' }),
  getWindowState: query(GetWindowStateResponseSchema, { channel: 'query:getWindowState' }),
});

// ============================================================
// Exported inferred types
// ============================================================

export type FullscreenStateDto = z.infer<typeof FullscreenStateDtoSchema>;
export type WindowStateDto = z.infer<typeof WindowStateDtoSchema>;
export type ToggleFullscreenResponse = z.infer<typeof ToggleFullscreenResponseSchema>;

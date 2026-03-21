// SPDX-License-Identifier: MIT
/**
 * Provides a CJS-compatible require globally for loading native module (serialport)
 * bindings in an ESM environment.
 *
 * @remarks
 * This file is used as a side-effect import.
 * Import it before any modules that depend on serialport.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
(globalThis as Record<string, unknown>).require = require;

// SPDX-License-Identifier: MIT
import type { Command } from '../../shared/model';

/** Runs an operator command and reports whether it succeeded. */
export type Run = (command: Command) => Promise<boolean>;

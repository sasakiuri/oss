// SPDX-License-Identifier: MIT
import type { Monitor, ScreenConfig } from '../shared/model';

/** The operating system and audience windows of this PC, as seen by the application. */
export interface DesktopPort {
  monitors(): Monitor[];
  open(config: ScreenConfig): void;
  close(id: string): void;
  status(id: string): { revision: number | null; alive: boolean };
  loginStart(enabled: boolean): Promise<void>;
  changed(): void;
}

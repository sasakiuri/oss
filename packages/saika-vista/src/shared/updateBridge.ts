// SPDX-License-Identifier: MIT
import type { AppUpdateStateDto } from '@sasakiuri/saika-updater';

export interface UpdateBridge {
  getState(): Promise<AppUpdateStateDto>;
  check(): Promise<AppUpdateStateDto>;
  install(): Promise<void>;
  onChange(callback: (state: AppUpdateStateDto) => void): () => void;
}

declare global {
  interface Window {
    vistaUpdates: UpdateBridge;
  }
}

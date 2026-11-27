// SPDX-License-Identifier: MIT
import { create } from 'zustand';

import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { reportService } from '@/renderer/services/reportService';
import { errorMessage } from '@/shared/errors/errorMessage';

interface PrintState {
  isPrinting: boolean;
  error: string | null;
  /** Prints the current session's score sheet; does nothing without a session or while printing. */
  printCurrentSession: () => Promise<void>;
  dismissError: () => void;
}

export const usePrintStore = create<PrintState>((set, get) => ({
  isPrinting: false,
  error: null,
  printCurrentSession: async () => {
    const sessionId = useSessionStore.getState().currentSessionId;
    if (!sessionId || get().isPrinting) return;
    set({ isPrinting: true, error: null });
    try {
      await reportService.openPrintWindow({ sessionId });
    } catch (error) {
      set({ error: errorMessage(error, 'Printing failed. Check Settings > Printing.') });
    } finally {
      set({ isPrinting: false });
    }
  },
  dismissError: () => set({ error: null }),
}));

// SPDX-License-Identifier: MIT
import { create } from 'zustand';

import { reportService } from '@/renderer/services/reportService';
import { errorMessage } from '@/shared/errors/errorMessage';

interface PrintState {
  isPrinting: boolean;
  error: string | null;
  print: (sessionId: string) => Promise<void>;
  dismissError: () => void;
}

export const usePrintStore = create<PrintState>((set, get) => ({
  isPrinting: false,
  error: null,
  print: async (sessionId) => {
    if (get().isPrinting) return;
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

import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { GAUGES } from '@/lib/trace-gauge';

export const TRACE_GAUGE_STORAGE_KEY = 'nilay-labs-trace-gauge-v1';

const gaugeIds = GAUGES.map((gauge) => gauge.id) as [string, ...string[]];
const savedSchema = z.object({ selected: z.array(z.enum(gaugeIds)) });

interface TraceGaugeStore {
  selected: string[];
  toggle: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
}

export const useTraceGaugeStore = create<TraceGaugeStore>()(
  persist(
    (set) => ({
      selected: [...gaugeIds],
      toggle: (id) =>
        set((state) => ({
          selected: state.selected.includes(id)
            ? state.selected.filter((item) => item !== id)
            : // Kept in the order of the list, so the pages lay out the same way each time.
              gaugeIds.filter((item) => item === id || state.selected.includes(item)),
        })),
      selectAll: () => set({ selected: [...gaugeIds] }),
      clear: () => set({ selected: [] }),
    }),
    {
      name: TRACE_GAUGE_STORAGE_KEY,
      storage: browserStorage as PersistStorage<{ selected: string[] }>,
      skipHydration: true,
      partialize: (state) => ({ selected: state.selected }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          reportDiscardedSave(TRACE_GAUGE_STORAGE_KEY);
          return current;
        }
        return { ...current, selected: parsed.data.selected };
      },
    },
  ),
);

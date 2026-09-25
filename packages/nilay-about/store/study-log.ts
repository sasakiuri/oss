import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { studyLogSchema, type DateKey, type StudyLog } from '@/lib/schemas/study-log';
import { dateKey, recordStudyDay } from '@/lib/study-log';

/**
 * The study days and the exam date, shared by every study tool in Labs.
 *
 * One record rather than one per tool: a reader who did the law quiz yesterday and the species
 * practice today has studied two days running, and the exam date is the same exam whichever tool
 * counts down to it. Like the language, it lives in this browser only.
 */
export const studyLogStorageKey = 'nilay-study-log-v1';

interface StudyLogStore extends StudyLog {
  hydrated: boolean;
  /** Read the saved record once; every screen that shows or writes it calls this first. */
  hydrate: () => Promise<void>;
  /** Mark a day as studied (today by default). */
  recordStudy: (today?: DateKey) => Promise<void>;
  setExamDate: (examDate: DateKey | null) => void;
}

export const useStudyLogStore = create<StudyLogStore>()(
  persist(
    (set, get) => ({
      days: [],
      examDate: null,
      hydrated: false,
      hydrate: async () => {
        if (get().hydrated) return;
        try {
          await useStudyLogStore.persist.rehydrate();
        } catch {
          // Storage that refuses to be read is reported by browserStorage itself.
        }
        set({ hydrated: true });
      },
      recordStudy: async (today = dateKey(new Date())) => {
        // Writing before the saved days are read would overwrite them with this one day.
        await get().hydrate();
        const days = recordStudyDay(get().days, today);
        if (days.length !== get().days.length) set({ days });
      },
      setExamDate: (examDate) => set({ examDate }),
    }),
    {
      name: studyLogStorageKey,
      storage: browserStorage as PersistStorage<StudyLog>,
      skipHydration: true,
      partialize: ({ days, examDate }) => ({ days, examDate }),
      merge: (saved, current) => {
        const parsed = studyLogSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data };
        if (saved !== undefined) reportDiscardedSave(studyLogStorageKey);
        return current;
      },
    },
  ),
);

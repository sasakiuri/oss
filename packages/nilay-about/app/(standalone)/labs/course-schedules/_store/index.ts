import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  COURSE_DATES_MAX,
  courseSchedulesSettingsSchema,
  type CourseDate,
  type CourseSchedulesSettings,
} from '@/lib/schemas/course-schedules';
import type { Prefecture } from '@/lib/schemas/hunting-log';

export const COURSE_SCHEDULES_STORAGE_KEY = 'nilay-labs-course-schedules-v1';

const savedSchema = z.object({ settings: courseSchedulesSettingsSchema });
type SavedState = z.infer<typeof savedSchema>;

const newId = () => Math.random().toString(36).slice(2, 10);

export const initialCourseSchedulesSettings: CourseSchedulesSettings = { prefecture: '東京都', dates: [] };

interface CourseSchedulesStore extends CourseSchedulesSettings {
  setPrefecture: (prefecture: Prefecture) => void;
  addDate: () => void;
  updateDate: (id: string, changes: Partial<Omit<CourseDate, 'id'>>) => void;
  removeDate: (id: string) => void;
  reset: () => void;
}

export const useCourseSchedulesStore = create<CourseSchedulesStore>()(
  persist(
    (set, get) => ({
      ...initialCourseSchedulesSettings,
      setPrefecture: (prefecture) => set({ prefecture }),
      addDate: () => {
        const { dates } = get();
        if (dates.length >= COURSE_DATES_MAX) return;
        set({ dates: [...dates, { id: newId(), kind: 'firearmsCourse', date: '', end: '', note: '' }] });
      },
      updateDate: (id, changes) =>
        set({ dates: get().dates.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)) }),
      removeDate: (id) => set({ dates: get().dates.filter((entry) => entry.id !== id) }),
      reset: () => set(initialCourseSchedulesSettings),
    }),
    {
      name: COURSE_SCHEDULES_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: { prefecture: state.prefecture, dates: state.dates } }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          reportDiscardedSave(COURSE_SCHEDULES_STORAGE_KEY);
          return current;
        }
        return { ...current, ...parsed.data.settings };
      },
    },
  ),
);

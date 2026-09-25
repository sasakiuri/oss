import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import type { GeoPoint } from '@/lib/geodesy';
import {
  MAX_NO_FIRE_SECTORS,
  MAX_PARTICIPANTS,
  MAX_STANDS,
  driveHuntPlanSchema,
  type DriveHuntPlan,
  type NoFireSector,
  type Participant,
  type Stand,
} from '@/lib/schemas/drive-hunt';

export const storageKey = 'nilay-labs-drive-hunt-v1';

const savedSchema = z.object({ plan: driveHuntPlanSchema });
type SavedState = z.infer<typeof savedSchema>;

interface DriveHuntStore extends DriveHuntPlan {
  lastValidPlan: DriveHuntPlan;
  edit: (
    changes: Partial<Pick<DriveHuntPlan, 'title' | 'date' | 'meeting' | 'radio' | 'notes' | 'sectorLength'>>,
  ) => void;
  addStand: (position: GeoPoint) => void;
  updateStand: (id: string, changes: Partial<Omit<Stand, 'id'>>) => void;
  removeStand: (id: string) => void;
  addSector: (standId: string) => void;
  updateSector: (standId: string, index: number, sector: NoFireSector) => void;
  removeSector: (standId: string, index: number) => void;
  addParticipant: (participant: Omit<Participant, 'id'>) => boolean;
  updateParticipant: (id: string, changes: Partial<Omit<Participant, 'id'>>) => void;
  removeParticipant: (id: string) => void;
  assign: (assignments: Map<string, string | null>) => void;
  /** Clears the plan. */
  reset: () => void;
}

export const initialPlan: DriveHuntPlan = {
  title: '',
  date: '',
  meeting: '',
  radio: '',
  notes: '',
  sectorLength: 300,
  stands: [],
  participants: [],
};

const pick = (state: DriveHuntPlan): DriveHuntPlan => ({
  title: state.title,
  date: state.date,
  meeting: state.meeting,
  radio: state.radio,
  notes: state.notes,
  sectorLength: state.sectorLength,
  stands: state.stands,
  participants: state.participants,
});

export const useDriveHuntStore = create<DriveHuntStore>()(
  persist(
    (set, get) => {
      const apply = (changes: Partial<DriveHuntPlan>) => {
        const parsed = driveHuntPlanSchema.safeParse({ ...pick(get()), ...changes });
        set({ ...changes, ...(parsed.success ? { lastValidPlan: parsed.data } : {}) });
      };
      const mapStand = (id: string, change: (stand: Stand) => Stand) =>
        apply({ stands: get().stands.map((stand) => (stand.id === id ? change(stand) : stand)) });
      return {
        ...initialPlan,
        lastValidPlan: initialPlan,
        edit: apply,
        addStand: (position) => {
          const { stands } = get();
          if (stands.length >= MAX_STANDS) return;
          apply({
            stands: [
              ...stands,
              { id: crypto.randomUUID(), label: String(stands.length + 1), position, noFire: [], assigneeId: null },
            ],
          });
        },
        updateStand: (id, changes) => mapStand(id, (stand) => ({ ...stand, ...changes })),
        removeStand: (id) => apply({ stands: get().stands.filter((stand) => stand.id !== id) }),
        addSector: (standId) =>
          mapStand(standId, (stand) =>
            stand.noFire.length >= MAX_NO_FIRE_SECTORS
              ? stand
              : { ...stand, noFire: [...stand.noFire, { from: 0, to: 30 }] },
          ),
        updateSector: (standId, index, sector) =>
          mapStand(standId, (stand) => ({
            ...stand,
            noFire: stand.noFire.map((entry, at) => (at === index ? sector : entry)),
          })),
        removeSector: (standId, index) =>
          mapStand(standId, (stand) => ({ ...stand, noFire: stand.noFire.filter((_, at) => at !== index) })),
        addParticipant: (participant) => {
          const { participants } = get();
          if (participants.length >= MAX_PARTICIPANTS) return false;
          apply({ participants: [...participants, { ...participant, id: crypto.randomUUID() }] });
          return true;
        },
        updateParticipant: (id, changes) =>
          apply({
            participants: get().participants.map((participant) =>
              participant.id === id ? { ...participant, ...changes } : participant,
            ),
          }),
        removeParticipant: (id) =>
          apply({
            participants: get().participants.filter((participant) => participant.id !== id),
            // Nobody stays assigned to a stand after leaving the list.
            stands: get().stands.map((stand) => (stand.assigneeId === id ? { ...stand, assigneeId: null } : stand)),
          }),
        assign: (assignments) =>
          apply({
            stands: get().stands.map((stand) =>
              assignments.has(stand.id) ? { ...stand, assigneeId: assignments.get(stand.id) ?? null } : stand,
            ),
          }),
        reset: () => set({ ...initialPlan, lastValidPlan: initialPlan }),
      };
    },
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ plan: state.lastValidPlan }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data.plan, lastValidPlan: parsed.data.plan };
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);

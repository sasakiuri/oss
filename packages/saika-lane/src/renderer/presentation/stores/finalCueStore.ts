import { create } from 'zustand';

import type { CompetitionCuePayload } from '@/shared/mqtt/CompetitionCue';

interface FinalCueStore {
  competitionId: string | null;
  cue: CompetitionCuePayload | null;
  setCue: (competitionId: string, cue: CompetitionCuePayload | null) => void;
}

export const useFinalCueStore = create<FinalCueStore>((set) => ({
  competitionId: null,
  cue: null,
  setCue: (competitionId, cue) => set({ competitionId: cue ? competitionId : null, cue }),
}));

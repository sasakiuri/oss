// SPDX-License-Identifier: MIT
import type { CompetitionCuePayload } from '@sasakiuri/saika-protocol/CompetitionCue';
import { create } from 'zustand';

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

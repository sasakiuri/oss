import { useEffect } from 'react';

import { useFinalCueStore } from '@/renderer/presentation/stores/finalCueStore';

export function useFinalCueEvents(): void {
  const setCue = useFinalCueStore((state) => state.setCue);

  useEffect(
    () => window.electronAPI.on.competitionCueChanged(({ competitionId, cue }) => setCue(competitionId, cue)),
    [setCue],
  );
}

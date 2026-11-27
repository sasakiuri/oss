// SPDX-License-Identifier: MIT
import React, { useEffect, useId, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { competitionService } from '@/renderer/services/competitionService';
import { settingsService } from '@/renderer/services/settingsService';
import type { CompetitionTypeDto } from '@/shared/ipc/contracts';

import { localProgressControls } from '../../policies/localProgressControls';
import { useCompetitionStore } from '../../stores/competitionStore';
import { useDirectorMembershipStore } from '../../stores/directorMembershipStore';
import { isProgressAllowed } from '../../stores/localProgressPermission';

export const SettingsTargetTab: React.FC = () => {
  // Subscribe only to the fields the progress policy reads, not to every timer tick.
  const membershipState = useDirectorMembershipStore(
    useShallow(({ membership, hydrated, hydrationFailed }) => ({ membership, hydrated, hydrationFailed })),
  );
  const competition = useCompetitionStore(
    useShallow(
      ({ phase, interruption, athleteTargetControl, athleteTargetControlPending, athleteTargetControlLoaded }) => ({
        phase,
        interruption,
        athleteTargetControl,
        athleteTargetControlPending,
        athleteTargetControlLoaded,
      }),
    ),
  );
  const permission = localProgressControls(membershipState, 'progress', competition);
  const reasonId = useId();
  const savedCompetitionTypeId = useCompetitionStore((s) => s.savedCompetitionTypeId);
  const [competitionTypes, setCompetitionTypes] = useState<CompetitionTypeDto[]>([]);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    const loadTypes = async () => {
      try {
        setCompetitionTypes(await competitionService.getCompetitionTypes());
      } catch {
        // Failed to load competition types
      }
    };
    loadTypes();
  }, []);

  const handleSelectCompetitionType = async (competitionTypeId: string) => {
    if (isApplying || !isProgressAllowed()) return;
    setIsApplying(true);
    try {
      const { competitionId } = await competitionService.startCompetition({ competitionTypeId });
      if (!isProgressAllowed()) return;
      await competitionService.startStage({ competitionId });
      try {
        await settingsService.saveUserPreferences({ competitionTypeId });
      } catch {
        // Save failure is non-critical
      }
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      {permission.reason && (
        <p id={reasonId} className="text-sm text-zinc-300">
          {permission.reason}
        </p>
      )}
      {competitionTypes.map(({ id, name }) => (
        <button
          key={id}
          onClick={() => handleSelectCompetitionType(id)}
          disabled={isApplying || !permission.allowed}
          aria-describedby={permission.reason ? reasonId : undefined}
          className={`flex items-center justify-start rounded px-4 py-3 text-left text-sm font-medium transition-colors ${
            savedCompetitionTypeId === id
              ? 'bg-zinc-700 text-zinc-100 ring-2 ring-blue-400'
              : 'bg-zinc-900 text-zinc-100 hover:bg-zinc-700'
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {name}
        </button>
      ))}
    </div>
  );
};

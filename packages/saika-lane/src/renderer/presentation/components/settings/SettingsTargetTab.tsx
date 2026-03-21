// SPDX-License-Identifier: MIT
import React, { useEffect, useState } from 'react';

import { competitionService } from '@/renderer/services/competitionService';
import { settingsService } from '@/renderer/services/settingsService';

import { useCompetitionStore } from '../../stores/competitionStore';

interface CompetitionTypeItem {
  id: string;
  name: string;
}

export const SettingsTargetTab: React.FC = () => {
  const savedCompetitionTypeId = useCompetitionStore((s) => s.savedCompetitionTypeId);
  const [competitionTypes, setCompetitionTypes] = useState<CompetitionTypeItem[]>([]);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    const loadTypes = async () => {
      try {
        const types = await competitionService.getCompetitionTypes();
        setCompetitionTypes(types.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
      } catch {
        // Failed to load competition types
      }
    };
    loadTypes();
  }, []);

  const handleSelectCompetitionType = async (competitionTypeId: string) => {
    if (isApplying) return;
    setIsApplying(true);
    try {
      const { competitionId } = await competitionService.startCompetition({ competitionTypeId });
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
      {competitionTypes.map(({ id, name }) => (
        <button
          key={id}
          onClick={() => handleSelectCompetitionType(id)}
          disabled={isApplying}
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

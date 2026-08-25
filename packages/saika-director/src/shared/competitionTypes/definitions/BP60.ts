import type { CompetitionTypeDefinition } from '../CompetitionTypeDefinition';

export const BP60: CompetitionTypeDefinition = {
  id: 'BP60',
  name: '10m Beam Pistol 60 Shots',
  scoring: {
    minScore: 0,
    maxScore: 100,
    precision: 0,
  },
  config: {
    name: 'Qualification',
    maxChannels: 10,
    hasRelay: true,
    stages: [
      {
        name: 'Preparation',
        type: 'preparation',
        series: [{ shots: 0 }],
        timer: { mode: 'series', durationSec: 600 },
      },
      {
        name: 'Match',
        type: 'match',
        series: [{ shots: 10 }, { shots: 10 }, { shots: 10 }, { shots: 10 }, { shots: 10 }, { shots: 10 }],
        timer: { mode: 'stage', durationSec: 2700 },
      },
    ],
  },
  rankingStrategyId: 'standard',
  displayHints: {
    shortName: 'BP60',
    description: '10m Beam Pistol 60 Shots',
  },
  resultFormat: {
    totalShots: 60,
    totalSeries: 6,
  },
};

import type { CompetitionTypeDefinition } from '../CompetitionTypeDefinition';

export const BR60S: CompetitionTypeDefinition = {
  id: 'BR60S',
  name: '10m Beam Rifle 60 Shots Standing',
  scoring: {
    minScore: 0,
    maxScore: 109,
    precision: 1,
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
    shortName: 'BR60S',
    description: '10m Beam Rifle Standing 60 Shots',
  },
  resultFormat: {
    totalShots: 60,
    totalSeries: 6,
  },
};

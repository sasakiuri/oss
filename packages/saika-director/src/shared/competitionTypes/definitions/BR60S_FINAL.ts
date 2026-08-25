import type { CompetitionTypeDefinition } from '../CompetitionTypeDefinition';

export const BR60S_FINAL: CompetitionTypeDefinition = {
  id: 'BR60S_FINAL',
  name: '10m Beam Rifle 60 Shots Standing',
  scoring: {
    minScore: 0,
    maxScore: 109,
    precision: 1,
  },
  config: {
    name: 'Final',
    maxChannels: 8,
    hasRelay: false,
    maxParticipants: 8,
    minParticipants: 2,
    stages: [
      {
        name: 'Preparation',
        type: 'preparation',
        series: [{ shots: 0 }],
        timer: { mode: 'series', durationSec: 300 },
      },
      {
        name: '1st Stage',
        type: 'match',
        series: [{ shots: 5 }, { shots: 5 }],
        timer: { mode: 'series', durationSec: 250 },
      },
      {
        name: '2nd Stage',
        type: 'match',
        series: [{ shots: 2 }, { shots: 2 }, { shots: 2 }, { shots: 2 }, { shots: 2 }, { shots: 2 }, { shots: 2 }],
        timer: { mode: 'shot', durationSec: 50 },
        elimination: { eliminateCount: 1, unit: 'series', tieBreaker: 'shootoff' },
      },
    ],
  },
  rankingStrategyId: 'standard',
  displayHints: {
    shortName: 'BR60S',
    description: '10m Beam Rifle Standing Final',
  },
  resultFormat: {
    totalShots: 24,
    totalSeries: 9,
    stage1Shots: 10,
  },
};

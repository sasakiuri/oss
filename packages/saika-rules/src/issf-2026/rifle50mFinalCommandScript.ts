import type { FinalCommandScriptCapability, RuleCommandScriptStep, RuleCommandSeriesTarget } from '../RulePack';

const PREFIX = 'issf.2026.r3p-final';
const NO_EFFECT = { type: 'NONE' } as const;

/** Official February 2026 command order for the 50m Rifle 3 Positions Final. */
export function buildIssf50mThreePositionsFinalCommandScript(): FinalCommandScriptCapability {
  const firstBlock = target('KNEELING_PRONE_CHANGEOVER', 1, 0, 2);
  const main: RuleCommandScriptStep[] = [
    step('reporting', 'OFFICIAL', 'CHECK', 'Finalists must report to the Preparation Area.', '6.17.1.3', {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -1800,
    }),
    step('athletes-to-line', 'CRO', 'COMMAND', 'ATHLETES TO THE LINE', '6.17.3(d)', {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -600,
    }),
    step(
      'presentation',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Present the finalists in firing-point order, followed by the Jury Member-in-Charge and Chief Range Officer.',
      '6.17.3(d)',
      { mode: 'MANUAL' },
    ),
    step('take-positions', 'CRO', 'COMMAND', 'TAKE YOUR POSITIONS', '6.17.3(d)', {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -395,
    }),
    withEffect(
      step('preparation-start', 'CRO', 'COMMAND', 'FIVE MINUTES PREPARATION AND SIGHTING TIME ... START', '6.17.3(d)', {
        mode: 'SCHEDULED_START_OFFSET',
        offsetSeconds: -365,
      }),
      {
        type: 'OPEN_FIRING',
        purpose: 'SIGHTING',
        participantSelection: 'ALL_ACTIVE',
        durationSeconds: 300,
      },
    ),
    step(
      'welcome-and-format',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Welcome spectators, introduce the event, and explain the Final format during Preparation and Sighting.',
      '6.17.3(d)',
      { mode: 'MANUAL' },
    ),
    step('preparation-warning', 'CRO', 'COMMAND', '30 SECONDS', '6.17.3(d)', {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -95,
    }),
    withEffect(
      step('preparation-stop', 'CRO', 'COMMAND', 'STOP', '6.17.3(d)', {
        mode: 'SCHEDULED_START_OFFSET',
        offsetSeconds: -65,
      }),
      { type: 'CLOSE_FIRING', purpose: 'SIGHTING' },
    ),
    step(
      'brief-explanation',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Give the brief explanation of the Final before MATCH firing.',
      '6.17.3(d)',
      { mode: 'MANUAL' },
    ),
    step(
      'match-targets-ready',
      'OFFICIAL',
      'CHECK',
      'Confirm with the Control Room that all targets and the scoreboard are cleared and set to MATCH.',
      '6.17.3(d)',
      { mode: 'MANUAL' },
    ),
    step(
      'twenty-two-minute-command',
      'CRO',
      'COMMAND',
      'FINALISTS HAVE TWENTY-TWO MINUTES TO FIRE TEN SHOTS IN EACH OF THE KNEELING AND PRONE POSITIONS AND PREPARE FOR THE STANDING POSITION.',
      '6.17.3(e)',
      { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: -15 },
    ),
    withEffect(
      step('start-kneeling-prone', 'CRO', 'COMMAND', 'MATCH FIRING ... START', '6.17.3(e)', {
        mode: 'SCHEDULED_START_OFFSET',
        offsetSeconds: 0,
      }),
      {
        type: 'OPEN_FIRING',
        purpose: 'MATCH',
        participantSelection: 'ALL_ACTIVE',
        durationSeconds: 1320,
        shotsPerParticipant: 20,
        target: firstBlock,
      },
    ),
    step(
      'kneeling-prone-commentary',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Comment throughout the kneeling, changeover, prone, and standing-preparation period; do not announce individual shot scores.',
      '6.17.3(e)-(f)',
      { mode: 'MANUAL' },
    ),
    step('five-minutes', 'CRO', 'COMMAND', 'FIVE MINUTES', '6.17.3(f)', {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: 1020,
    }),
    step('thirty-seconds', 'CRO', 'COMMAND', '30 SECONDS', '6.17.3(f)', {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: 1290,
    }),
    withEffect(
      step('stop-kneeling-prone', 'CRO', 'COMMAND', 'STOP', '6.17.3(f)', {
        mode: 'SCHEDULED_START_OFFSET',
        offsetSeconds: 1320,
      }),
      { type: 'CLOSE_FIRING', purpose: 'MATCH', target: firstBlock },
    ),
    step(
      'standing-format-commentary',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Comment for 15-20 seconds on the ranking and explain the two commanded five-shot Standing series.',
      '6.17.3(g)',
      { mode: 'MANUAL' },
    ),
  ];

  for (let seriesIndex = 0; seriesIndex < 2; seriesIndex += 1) {
    const seriesTarget = target('STANDING_SERIES', 2, seriesIndex);
    main.push(
      withEffect(
        step(
          `load-standing-series-${seriesIndex + 1}`,
          'CRO',
          'COMMAND',
          'FOR THE NEXT COMPETITION SERIES ... LOAD',
          '6.17.3(g)',
          seriesIndex === 0 ? { mode: 'AFTER_PREVIOUS', delaySeconds: 30 } : { mode: 'MANUAL' },
        ),
        { type: 'LOAD', purpose: 'MATCH', participantSelection: 'ALL_ACTIVE', target: seriesTarget },
      ),
      withEffect(
        step(`start-standing-series-${seriesIndex + 1}`, 'CRO', 'COMMAND', 'START', '6.17.3(g)', {
          mode: 'AFTER_PREVIOUS',
          delaySeconds: 5,
        }),
        {
          type: 'OPEN_FIRING',
          purpose: 'MATCH',
          participantSelection: 'ALL_ACTIVE',
          durationSeconds: 250,
          shotsPerParticipant: 5,
          target: seriesTarget,
        },
      ),
      withEffect(
        step(`stop-standing-series-${seriesIndex + 1}`, 'CRO', 'COMMAND', 'STOP', '6.17.3(g)', {
          mode: 'TIME_OR_ALL_SHOTS',
          durationSeconds: 250,
          shotsPerParticipant: 5,
        }),
        { type: 'CLOSE_FIRING', purpose: 'MATCH', target: seriesTarget },
      ),
      step(
        `commentary-standing-series-${seriesIndex + 1}`,
        'ANNOUNCER',
        'ANNOUNCEMENT',
        seriesIndex === 0
          ? 'Comment for 15-20 seconds on the ranking and explain that two finalists will be eliminated after the next series.'
          : 'Recognize the eighth- and seventh-place finalists and explain that single-shot eliminations now begin.',
        '6.17.3(g)-(h)',
        { mode: 'MANUAL' },
      ),
    );
  }

  main.push(
    checkpoint(
      'checkpoint-30-rank-8',
      30,
      'Confirm rank 8, resolving the special countback or a shoot-off before retiring the finalist.',
    ),
    checkpoint(
      'checkpoint-30-rank-7',
      30,
      'Confirm rank 7 after rank 8 is recorded, resolving the special countback or a shoot-off as required.',
    ),
    step(
      'safety-30',
      'OFFICIAL',
      'CHECK',
      'Confirm both eliminated finalists have unloaded, opened the actions, inserted safety flags, and stepped back.',
      '6.17.3(h)',
      { mode: 'MANUAL' },
    ),
  );

  for (let seriesIndex = 0; seriesIndex < 5; seriesIndex += 1) {
    const shotNumber = 31 + seriesIndex;
    const singleTarget = target('STANDING_SINGLE_SHOTS', 3, seriesIndex);
    const last = shotNumber === 35;
    main.push(
      withEffect(
        step(`load-shot-${shotNumber}`, 'CRO', 'COMMAND', 'FOR THE NEXT COMPETITION SHOT ... LOAD', '6.17.3(h)', {
          mode: 'MANUAL',
        }),
        { type: 'LOAD', purpose: 'MATCH', participantSelection: 'ALL_ACTIVE', target: singleTarget },
      ),
      withEffect(
        step(`start-shot-${shotNumber}`, 'CRO', 'COMMAND', 'START', '6.17.3(h)', {
          mode: 'AFTER_PREVIOUS',
          delaySeconds: 5,
        }),
        {
          type: 'OPEN_FIRING',
          purpose: 'MATCH',
          participantSelection: 'ALL_ACTIVE',
          durationSeconds: 50,
          shotsPerParticipant: 1,
          target: singleTarget,
        },
      ),
      withEffect(
        step(`stop-shot-${shotNumber}`, 'CRO', 'COMMAND', last ? 'STOP ... UNLOAD' : 'STOP', '6.17.3(h)', {
          mode: 'TIME_OR_ALL_SHOTS',
          durationSeconds: 50,
          shotsPerParticipant: 1,
        }),
        { type: 'CLOSE_FIRING', purpose: 'MATCH', target: singleTarget },
      ),
      checkpoint(
        `checkpoint-${shotNumber}`,
        shotNumber,
        last
          ? 'Confirm the gold and silver medal positions and resolve any tie before Final completion.'
          : `Confirm the finalist in rank ${37 - shotNumber}, resolving any tie before retiring that finalist.`,
      ),
      step(
        `safety-${shotNumber}`,
        'OFFICIAL',
        'CHECK',
        last
          ? 'Confirm all rifles are unloaded with actions open and safety flags inserted.'
          : 'Confirm the eliminated finalist has unloaded, opened the action, inserted a safety flag, and stepped back.',
        '6.17.3(h)',
        { mode: 'MANUAL' },
      ),
    );
    if (!last) {
      main.push(
        step(
          `commentary-shot-${shotNumber}`,
          'ANNOUNCER',
          'ANNOUNCEMENT',
          'Recognize the eliminated finalist and comment for 15-20 seconds on the remaining ranking and notable scores.',
          '6.17.3(h)',
          { mode: 'MANUAL' },
        ),
      );
    }
  }

  main.push(
    step(
      'completion-clearance',
      'OFFICIAL',
      'CHECK',
      'Confirm with the Control Room that there are no unresolved ties or protests and that the current Final result list is approved.',
      '6.17.3(j)',
      { mode: 'MANUAL' },
    ),
    withEffect(step('declare-results', 'CRO', 'DECLARATION', 'RESULTS ARE FINAL', '6.17.3(j)', { mode: 'MANUAL' }), {
      type: 'DECLARE_RESULTS',
    }),
    step(
      'medallist-presentation',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Present the bronze, silver, and gold medallists by country and name.',
      '6.17.1.14(q), 6.17.3(j)',
      { mode: 'MANUAL' },
    ),
  );

  return {
    version: 'ISSF-2026-02-50m-3p-conformance-2',
    source: {
      organization: 'ISSF',
      title: 'Commands and Announcements for Finals 2026 — 50m Rifle 3 Positions',
      version: 'February 2026',
    },
    main,
    shootOff: shootOffSteps(),
  };
}

function shootOffSteps(): RuleCommandScriptStep[] {
  return [
    step(
      'shoot-off-announce',
      'CRO',
      'ANNOUNCEMENT',
      'Announce the family names and firing points of the tied finalists only.',
      '6.17.3(i)',
      { mode: 'MANUAL' },
    ),
    withEffect(
      step('shoot-off-load', 'CRO', 'COMMAND', 'FOR THE SHOOT-OFF SHOT ... LOAD', '6.17.3(i)', {
        mode: 'MANUAL',
      }),
      { type: 'LOAD', purpose: 'SHOOT_OFF', participantSelection: 'TIED_ONLY' },
    ),
    withEffect(
      step('shoot-off-start', 'CRO', 'COMMAND', 'START', '6.17.3(i)', {
        mode: 'AFTER_PREVIOUS',
        delaySeconds: 5,
      }),
      {
        type: 'OPEN_FIRING',
        purpose: 'SHOOT_OFF',
        participantSelection: 'TIED_ONLY',
        durationSeconds: 50,
        shotsPerParticipant: 1,
      },
    ),
    withEffect(
      step('shoot-off-stop', 'CRO', 'COMMAND', 'STOP', '6.17.3(i)', {
        mode: 'TIME_OR_ALL_SHOTS',
        durationSeconds: 50,
        shotsPerParticipant: 1,
      }),
      { type: 'CLOSE_FIRING', purpose: 'SHOOT_OFF' },
    ),
    step(
      'shoot-off-commentary',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Comment on the tie-break situation for no more than ten seconds.',
      '6.17.3(i)',
      { mode: 'MANUAL' },
    ),
    withEffect(
      step(
        'shoot-off-checkpoint',
        'OFFICIAL',
        'CHECK',
        'Confirm whether the tie is broken; repeat this branch if it is not.',
        '6.17.3(i)',
        { mode: 'MANUAL' },
      ),
      { type: 'CHECKPOINT' },
    ),
  ];
}

function checkpoint(suffix: string, afterMatchShot: number, text: string): RuleCommandScriptStep {
  return withEffect(step(suffix, 'OFFICIAL', 'CHECK', text, '6.17.3(h)-(i)', { mode: 'MANUAL' }), {
    type: 'CHECKPOINT',
    afterMatchShot,
  });
}

function target(
  stageId: string,
  stageIndex: number,
  seriesIndex: number,
  seriesCount?: number,
): RuleCommandSeriesTarget {
  return { stageId, stageIndex, seriesIndex, ...(seriesCount ? { seriesCount } : {}) };
}

function withEffect(source: RuleCommandScriptStep, effect: RuleCommandScriptStep['effect']): RuleCommandScriptStep {
  return { ...source, effect };
}

function step(
  suffix: string,
  actor: RuleCommandScriptStep['actor'],
  kind: RuleCommandScriptStep['kind'],
  text: string,
  ruleReference: string,
  timing: RuleCommandScriptStep['timing'],
): RuleCommandScriptStep {
  return { id: `${PREFIX}.${suffix}`, actor, kind, text, ruleReference, timing, effect: NO_EFFECT };
}

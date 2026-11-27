import type { FinalCommandScriptCapability, RuleCommandScriptStep, RuleCommandSeriesTarget } from '../RulePack';

import { checkpoint, step, withEffect } from './commandScriptSteps';

interface FinalStageSpec {
  readonly stageId: string;
  readonly stageIndex: number;
  readonly shotsPerSeries: number;
  readonly seriesCount: number;
  readonly durationSeconds: number;
  readonly checkpointEverySeries?: number;
}

interface Issf10mFinalCommandScriptOptions {
  readonly idPrefix: string;
  readonly callToLineLeadSeconds: number;
  readonly takePositionsLeadSeconds: number;
  readonly stages: readonly FinalStageSpec[];
  readonly ruleReferences: {
    readonly reporting: string;
    readonly callToLine: string;
    readonly preparation: string;
    readonly multiShot: string;
    readonly singleShot: string;
    readonly checkpoint: string;
    readonly completion: string;
    readonly shootOff: string;
  };
}

/** Builds the official 2026 10m Final command order without application concerns. */
export function buildIssf10mFinalCommandScript(
  options: Issf10mFinalCommandScriptOptions,
): FinalCommandScriptCapability {
  const prefix = options.idPrefix;
  const main: RuleCommandScriptStep[] = [
    step(
      prefix,
      'reporting',
      'OFFICIAL',
      'CHECK',
      'Finalists must report to the Preparation Area.',
      options.ruleReferences.reporting,
      {
        mode: 'SCHEDULED_START_OFFSET',
        offsetSeconds: -1800,
      },
    ),
    step(prefix, 'athletes-to-line', 'CRO', 'COMMAND', 'ATHLETES TO THE LINE', options.ruleReferences.callToLine, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -options.callToLineLeadSeconds,
    }),
    step(
      prefix,
      'presentation',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Present the finalists in firing-point order, followed by the Jury Member-in-Charge and Chief Range Officer.',
      options.ruleReferences.callToLine,
      { mode: 'MANUAL' },
    ),
    step(prefix, 'take-positions', 'CRO', 'COMMAND', 'TAKE YOUR POSITIONS', options.ruleReferences.preparation, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -options.takePositionsLeadSeconds,
    }),
    withEffect(
      step(
        prefix,
        'preparation-start',
        'CRO',
        'COMMAND',
        'FIVE MINUTES PREPARATION AND SIGHTING TIME ... START',
        options.ruleReferences.preparation,
        { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: -365 },
      ),
      {
        type: 'OPEN_FIRING',
        purpose: 'SIGHTING',
        participantSelection: 'ALL_ACTIVE',
        durationSeconds: 300,
      },
    ),
    step(
      prefix,
      'welcome-and-format',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Welcome spectators, introduce the event, and explain the Final format during Preparation and Sighting.',
      options.ruleReferences.preparation,
      { mode: 'MANUAL' },
    ),
    step(prefix, 'preparation-warning', 'CRO', 'COMMAND', '30 SECONDS', options.ruleReferences.preparation, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -95,
    }),
    withEffect(
      step(prefix, 'preparation-stop', 'CRO', 'COMMAND', 'STOP ... UNLOAD', options.ruleReferences.preparation, {
        mode: 'SCHEDULED_START_OFFSET',
        offsetSeconds: -65,
      }),
      { type: 'CLOSE_FIRING', purpose: 'SIGHTING' },
    ),
    step(
      prefix,
      'brief-explanation',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Give the brief explanation of the Final before MATCH firing.',
      options.ruleReferences.preparation,
      { mode: 'MANUAL' },
    ),
    step(
      prefix,
      'match-targets-ready',
      'OFFICIAL',
      'CHECK',
      'Confirm with the Control Room that all targets and the scoreboard are cleared and set to MATCH.',
      options.ruleReferences.preparation,
      { mode: 'MANUAL' },
    ),
  ];

  let cumulativeMatchShots = 0;
  let previousTarget: RuleCommandSeriesTarget | null = null;
  for (const [stageIndex, stage] of options.stages.entries()) {
    for (let seriesIndex = 0; seriesIndex < stage.seriesCount; seriesIndex += 1) {
      const target = { stageId: stage.stageId, stageIndex: stage.stageIndex, seriesIndex } as const;
      const firstSeries = stageIndex === 0 && seriesIndex === 0;
      const singleShot = stage.shotsPerSeries === 1;
      const seriesNumber = seriesIndex + 1;
      const loadText = firstSeries
        ? 'FOR THE FIRST COMPETITION SERIES ... LOAD'
        : singleShot
          ? 'FOR THE NEXT COMPETITION SHOT ... LOAD'
          : 'FOR THE NEXT COMPETITION SERIES ... LOAD';
      main.push(
        withEffect(
          step(
            prefix,
            `load-${stage.stageId}-${seriesNumber}`,
            'CRO',
            'COMMAND',
            loadText,
            singleShot ? options.ruleReferences.singleShot : options.ruleReferences.multiShot,
            firstSeries ? { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: -5 } : { mode: 'MANUAL' },
          ),
          {
            type: 'LOAD',
            purpose: 'MATCH',
            participantSelection: 'ALL_ACTIVE',
            target,
          },
        ),
      );
      main.push(
        withEffect(
          step(
            prefix,
            `start-${stage.stageId}-${seriesNumber}`,
            'CRO',
            'COMMAND',
            'START',
            singleShot ? options.ruleReferences.singleShot : options.ruleReferences.multiShot,
            firstSeries
              ? { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: 0 }
              : { mode: 'AFTER_PREVIOUS', delaySeconds: 5 },
          ),
          {
            type: 'OPEN_FIRING',
            purpose: 'MATCH',
            participantSelection: 'ALL_ACTIVE',
            durationSeconds: stage.durationSeconds,
            shotsPerParticipant: stage.shotsPerSeries,
            target,
          },
        ),
      );

      cumulativeMatchShots += stage.shotsPerSeries;
      const lastSeries = stageIndex === options.stages.length - 1 && seriesIndex === stage.seriesCount - 1;
      main.push(
        withEffect(
          step(
            prefix,
            `stop-${stage.stageId}-${seriesNumber}`,
            'CRO',
            'COMMAND',
            lastSeries ? 'STOP ... UNLOAD' : 'STOP',
            singleShot ? options.ruleReferences.singleShot : options.ruleReferences.multiShot,
            {
              mode: 'TIME_OR_ALL_SHOTS',
              durationSeconds: stage.durationSeconds,
              shotsPerParticipant: stage.shotsPerSeries,
            },
          ),
          { type: 'CLOSE_FIRING', purpose: 'MATCH', target },
        ),
      );

      if (stage.checkpointEverySeries && (seriesIndex + 1) % stage.checkpointEverySeries === 0) {
        const finalCheckpoint = lastSeries;
        main.push(
          checkpoint(
            prefix,
            `checkpoint-${cumulativeMatchShots}`,
            cumulativeMatchShots,
            finalCheckpoint
              ? 'Confirm the gold and silver medal positions and resolve any tie before Final completion.'
              : 'Confirm the Final checkpoint, resolve any tie, and retire only the confirmed lowest participant.',
            options.ruleReferences.checkpoint,
          ),
        );
        main.push(
          step(
            prefix,
            `safety-${cumulativeMatchShots}`,
            'OFFICIAL',
            'CHECK',
            finalCheckpoint
              ? 'Confirm all firearms are unloaded with actions open and safety flags inserted.'
              : 'Confirm each eliminated finalist has unloaded, opened the action, inserted a safety flag, and stepped back.',
            options.ruleReferences.checkpoint,
            { mode: 'MANUAL' },
          ),
        );
      }

      const firstFiveShotSeries = stage.shotsPerSeries > 1 && seriesIndex === 0;
      const lastFiveShotSeries = stage.shotsPerSeries > 1 && seriesIndex === stage.seriesCount - 1;
      const eliminationCheckpoint = Boolean(
        stage.checkpointEverySeries && (seriesIndex + 1) % stage.checkpointEverySeries === 0,
      );
      if (!lastSeries) {
        main.push(
          step(
            prefix,
            `commentary-${stage.stageId}-${seriesNumber}`,
            'ANNOUNCER',
            'ANNOUNCEMENT',
            firstFiveShotSeries
              ? 'Comment for 15-20 seconds on the current ranking and notable scores; do not announce individual shot scores.'
              : lastFiveShotSeries
                ? 'Comment for 15-20 seconds on the ranking and explain that single shots and eliminations now begin.'
                : eliminationCheckpoint
                  ? 'Recognize the eliminated finalist and comment for 15-20 seconds on the remaining ranking and notable scores.'
                  : 'Comment for 15-20 seconds on the current ranking and indicate who may be eliminated after the next shot.',
            `${options.ruleReferences.multiShot}, ${options.ruleReferences.singleShot}`,
            { mode: 'MANUAL' },
          ),
        );
      }
      previousTarget = target;
    }
  }

  if (!previousTarget) throw new Error('A Final command script requires at least one MATCH series');
  main.push(
    step(
      prefix,
      'completion-clearance',
      'OFFICIAL',
      'CHECK',
      'Confirm with the Control Room that there are no unresolved ties or protests and that the current Final result list is approved.',
      options.ruleReferences.completion,
      { mode: 'MANUAL' },
    ),
  );
  main.push(
    withEffect(
      step(prefix, 'declare-results', 'CRO', 'DECLARATION', 'RESULTS ARE FINAL', options.ruleReferences.completion, {
        mode: 'MANUAL',
      }),
      { type: 'DECLARE_RESULTS' },
    ),
  );
  main.push(
    step(
      prefix,
      'medallist-presentation',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Present the bronze, silver, and gold medallists by country and name.',
      options.ruleReferences.completion,
      { mode: 'MANUAL' },
    ),
  );

  const shootOff: RuleCommandScriptStep[] = [
    step(
      prefix,
      'shoot-off-announce',
      'CRO',
      'ANNOUNCEMENT',
      'Announce the family names and firing points of the tied participants only.',
      options.ruleReferences.shootOff,
      { mode: 'MANUAL' },
    ),
    withEffect(
      step(
        prefix,
        'shoot-off-load',
        'CRO',
        'COMMAND',
        'FOR THE SHOOT-OFF SHOT ... LOAD',
        options.ruleReferences.shootOff,
        { mode: 'MANUAL' },
      ),
      { type: 'LOAD', purpose: 'SHOOT_OFF', participantSelection: 'TIED_ONLY' },
    ),
    withEffect(
      step(prefix, 'shoot-off-start', 'CRO', 'COMMAND', 'START', options.ruleReferences.shootOff, {
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
      step(prefix, 'shoot-off-stop', 'CRO', 'COMMAND', 'STOP', options.ruleReferences.shootOff, {
        mode: 'TIME_OR_ALL_SHOTS',
        durationSeconds: 50,
        shotsPerParticipant: 1,
      }),
      { type: 'CLOSE_FIRING', purpose: 'SHOOT_OFF' },
    ),
    step(
      prefix,
      'shoot-off-commentary',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Comment on the tie-break situation for no more than ten seconds.',
      options.ruleReferences.shootOff,
      { mode: 'MANUAL' },
    ),
    withEffect(
      step(
        prefix,
        'shoot-off-checkpoint',
        'OFFICIAL',
        'CHECK',
        'Confirm whether the tie is broken; repeat this branch if it is not.',
        options.ruleReferences.shootOff,
        { mode: 'MANUAL' },
      ),
      { type: 'CHECKPOINT' },
    ),
  ];

  return {
    version: 'ISSF-2026-02-conformance-2',
    source: {
      organization: 'ISSF',
      title: 'Commands and Announcements for Finals 2026',
      version: 'February 2026',
    },
    main,
    shootOff,
  };
}

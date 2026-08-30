import type { FinalCommandScriptCapability, RuleCommandScriptStep, RuleCommandSeriesTarget } from '../RulePack';

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

const NO_EFFECT = { type: 'NONE' } as const;

/** Builds the official 2026 10m Final command order without application concerns. */
export function buildIssf10mFinalCommandScript(
  options: Issf10mFinalCommandScriptOptions,
): FinalCommandScriptCapability {
  const main: RuleCommandScriptStep[] = [
    step(
      options,
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
    step(options, 'athletes-to-line', 'CRO', 'COMMAND', 'ATHLETES TO THE LINE', options.ruleReferences.callToLine, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -options.callToLineLeadSeconds,
    }),
    step(options, 'take-positions', 'CRO', 'COMMAND', 'TAKE YOUR POSITIONS', options.ruleReferences.preparation, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -options.takePositionsLeadSeconds,
    }),
    {
      ...step(
        options,
        'preparation-start',
        'CRO',
        'COMMAND',
        'FIVE MINUTES PREPARATION AND SIGHTING TIME ... START',
        options.ruleReferences.preparation,
        { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: -365 },
      ),
      effect: {
        type: 'OPEN_FIRING',
        purpose: 'SIGHTING',
        participantSelection: 'ALL_ACTIVE',
        durationSeconds: 300,
      },
    },
    step(options, 'preparation-warning', 'CRO', 'COMMAND', '30 SECONDS', options.ruleReferences.preparation, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -95,
    }),
    {
      ...step(options, 'preparation-stop', 'CRO', 'COMMAND', 'STOP ... UNLOAD', options.ruleReferences.preparation, {
        mode: 'SCHEDULED_START_OFFSET',
        offsetSeconds: -65,
      }),
      effect: { type: 'CLOSE_FIRING', purpose: 'SIGHTING' },
    },
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
      main.push({
        ...step(
          options,
          `load-${stage.stageId}-${seriesNumber}`,
          'CRO',
          'COMMAND',
          loadText,
          singleShot ? options.ruleReferences.singleShot : options.ruleReferences.multiShot,
          firstSeries ? { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: -5 } : { mode: 'MANUAL' },
        ),
        effect: {
          type: 'LOAD',
          purpose: 'MATCH',
          participantSelection: 'ALL_ACTIVE',
          target,
        },
      });
      main.push({
        ...step(
          options,
          `start-${stage.stageId}-${seriesNumber}`,
          'CRO',
          'COMMAND',
          'START',
          singleShot ? options.ruleReferences.singleShot : options.ruleReferences.multiShot,
          firstSeries
            ? { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: 0 }
            : { mode: 'AFTER_PREVIOUS', delaySeconds: 5 },
        ),
        effect: {
          type: 'OPEN_FIRING',
          purpose: 'MATCH',
          participantSelection: 'ALL_ACTIVE',
          durationSeconds: stage.durationSeconds,
          shotsPerParticipant: stage.shotsPerSeries,
          target,
        },
      });

      cumulativeMatchShots += stage.shotsPerSeries;
      const lastSeries = stageIndex === options.stages.length - 1 && seriesIndex === stage.seriesCount - 1;
      main.push({
        ...step(
          options,
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
        effect: { type: 'CLOSE_FIRING', purpose: 'MATCH', target },
      });

      if (stage.checkpointEverySeries && (seriesIndex + 1) % stage.checkpointEverySeries === 0) {
        main.push({
          ...step(
            options,
            `checkpoint-${cumulativeMatchShots}`,
            'OFFICIAL',
            'CHECK',
            'Confirm the Final checkpoint, resolve any tie, and retire only the confirmed lowest participant.',
            options.ruleReferences.checkpoint,
            { mode: 'MANUAL' },
          ),
          effect: { type: 'CHECKPOINT', afterMatchShot: cumulativeMatchShots },
        });
      }

      main.push(
        step(
          options,
          `commentary-${stage.stageId}-${seriesNumber}`,
          'ANNOUNCER',
          'ANNOUNCEMENT',
          'Comment on the current ranking and notable scores.',
          `${options.ruleReferences.multiShot}, ${options.ruleReferences.singleShot}`,
          { mode: 'MANUAL' },
        ),
      );
      previousTarget = target;
    }
  }

  if (!previousTarget) throw new Error('A Final command script requires at least one MATCH series');
  main.push({
    ...step(options, 'declare-results', 'CRO', 'DECLARATION', 'RESULTS ARE FINAL', options.ruleReferences.completion, {
      mode: 'MANUAL',
    }),
    effect: { type: 'DECLARE_RESULTS' },
  });

  const shootOff: RuleCommandScriptStep[] = [
    step(
      options,
      'shoot-off-announce',
      'CRO',
      'ANNOUNCEMENT',
      'Announce the family names and firing points of the tied participants only.',
      options.ruleReferences.shootOff,
      { mode: 'MANUAL' },
    ),
    {
      ...step(
        options,
        'shoot-off-load',
        'CRO',
        'COMMAND',
        'FOR THE SHOOT-OFF SHOT ... LOAD',
        options.ruleReferences.shootOff,
        { mode: 'MANUAL' },
      ),
      effect: { type: 'LOAD', purpose: 'SHOOT_OFF', participantSelection: 'TIED_ONLY' },
    },
    {
      ...step(options, 'shoot-off-start', 'CRO', 'COMMAND', 'START', options.ruleReferences.shootOff, {
        mode: 'AFTER_PREVIOUS',
        delaySeconds: 5,
      }),
      effect: {
        type: 'OPEN_FIRING',
        purpose: 'SHOOT_OFF',
        participantSelection: 'TIED_ONLY',
        durationSeconds: 50,
        shotsPerParticipant: 1,
      },
    },
    {
      ...step(options, 'shoot-off-stop', 'CRO', 'COMMAND', 'STOP', options.ruleReferences.shootOff, {
        mode: 'TIME_OR_ALL_SHOTS',
        durationSeconds: 50,
        shotsPerParticipant: 1,
      }),
      effect: { type: 'CLOSE_FIRING', purpose: 'SHOOT_OFF' },
    },
    step(
      options,
      'shoot-off-commentary',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Comment on the tie-break situation for no more than ten seconds.',
      options.ruleReferences.shootOff,
      { mode: 'MANUAL' },
    ),
    {
      ...step(
        options,
        'shoot-off-checkpoint',
        'OFFICIAL',
        'CHECK',
        'Confirm whether the tie is broken; repeat this branch if it is not.',
        options.ruleReferences.shootOff,
        { mode: 'MANUAL' },
      ),
      effect: { type: 'CHECKPOINT' },
    },
  ];

  return { version: 'ISSF-2026-02', main, shootOff };
}

function step(
  options: Issf10mFinalCommandScriptOptions,
  suffix: string,
  actor: RuleCommandScriptStep['actor'],
  kind: RuleCommandScriptStep['kind'],
  text: string,
  ruleReference: string,
  timing: RuleCommandScriptStep['timing'],
): RuleCommandScriptStep {
  return {
    id: `${options.idPrefix}.${suffix}`,
    actor,
    kind,
    text,
    ruleReference,
    timing,
    effect: NO_EFFECT,
  };
}

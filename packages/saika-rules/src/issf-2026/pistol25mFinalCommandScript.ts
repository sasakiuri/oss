import type {
  FinalCommandScriptCapability,
  RuleCommandParticipantSelection,
  RuleCommandScriptStep,
  RuleCommandSeriesTarget,
} from '../RulePack';

const NO_EFFECT = { type: 'NONE' } as const;
const FINAL_STAGE_ID = 'FINAL_SERIES';
const FINAL_STAGE_INDEX = 1;

/** Official February 2026 command order for the 25m Pistol Women Final. */
export function buildIssf25mPistolWomenFinalCommandScript(): FinalCommandScriptCapability {
  const prefix = 'issf.2026.p25-final';
  const reference = '6.17.5';
  const main: RuleCommandScriptStep[] = [
    step(prefix, 'reporting', 'OFFICIAL', 'CHECK', 'Finalists must report to the Preparation Area.', '6.17.1.3', {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -1800,
    }),
    step(prefix, 'athletes-to-line', 'CRO', 'COMMAND', 'ATHLETES TO THE LINE', reference, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -540,
    }),
    step(
      prefix,
      'presentation',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Present the finalists in firing-point order, followed by the Jury Member-in-Charge and Chief Range Officer.',
      reference,
      { mode: 'MANUAL' },
    ),
    step(prefix, 'take-positions', 'CRO', 'COMMAND', 'TAKE YOUR POSITIONS', reference, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -335,
    }),
    step(prefix, 'preparation-start', 'CRO', 'COMMAND', 'PREPARATION BEGINS NOW', reference, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -325,
    }),
    step(prefix, 'preparation-end', 'CRO', 'COMMAND', 'END OF PREPARATION', reference, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -205,
    }),
    withEffect(
      step(prefix, 'sighting-load', 'CRO', 'COMMAND', 'LOAD', reference, {
        mode: 'SCHEDULED_START_OFFSET',
        offsetSeconds: -190,
      }),
      { type: 'LOAD', purpose: 'SIGHTING', participantSelection: 'ALL_ACTIVE' },
    ),
    timedStep({
      prefix,
      suffix: 'sighting-ready',
      text: 'SIGHTING SERIES ... READY',
      ruleReference: reference,
      timing: { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: -130 },
      purpose: 'SIGHTING',
      programId: 'P25_FINAL_SIGHTING_RAPID_3_7',
      target: target(0),
      participantSelection: 'ALL_ACTIVE',
    }),
    step(prefix, 'sighting-attention', 'CRO', 'COMMAND', 'ATTENTION', reference, {
      mode: 'AFTER_PREVIOUS',
      delaySeconds: 20,
    }),
    step(prefix, 'sighting-stop', 'CRO', 'COMMAND', 'STOP', reference, {
      mode: 'TIME_OR_ALL_SHOTS',
      durationSeconds: 58,
      shotsPerParticipant: 5,
    }),
    step(
      prefix,
      'brief-explanation',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Give the brief explanation of the Final; confirm the targets and scoreboard are cleared and set to MATCH.',
      reference,
      { mode: 'MANUAL' },
    ),
  ];

  for (let seriesIndex = 0; seriesIndex < 10; seriesIndex += 1) {
    const seriesNumber = seriesIndex + 1;
    const last = seriesNumber === 10;
    main.push(
      timedStep({
        prefix,
        suffix: `series-${seriesNumber}-ready`,
        text: seriesNumber === 1 ? 'FIRST SERIES ... READY' : 'NEXT SERIES ... READY',
        ruleReference: reference,
        timing:
          seriesNumber === 1
            ? { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: -20 }
            : { mode: 'AFTER_PREVIOUS', delaySeconds: 15 },
        purpose: 'MATCH',
        programId: 'P25_FINAL_MATCH_RAPID_3_7',
        target: target(seriesIndex),
        participantSelection: 'ALL_ACTIVE',
      }),
      step(prefix, `series-${seriesNumber}-attention`, 'CRO', 'COMMAND', 'ATTENTION', reference, {
        mode: 'AFTER_PREVIOUS',
        delaySeconds: 20,
      }),
      withEffect(
        step(prefix, `series-${seriesNumber}-stop`, 'CRO', 'COMMAND', last ? 'STOP ... UNLOAD' : 'STOP', reference, {
          mode: 'TIME_OR_ALL_SHOTS',
          durationSeconds: 58,
          shotsPerParticipant: 5,
        }),
        { type: 'CLOSE_FIRING', purpose: 'MATCH', target: target(seriesIndex) },
      ),
      step(
        prefix,
        `series-${seriesNumber}-commentary`,
        'ANNOUNCER',
        'ANNOUNCEMENT',
        seriesNumber === 3
          ? 'Comment for 15-20 seconds on the ranking and explain that elimination begins after the next series.'
          : 'Comment for 15-20 seconds on the current ranking and notable scores; do not announce individual shot scores.',
        reference,
        { mode: 'MANUAL' },
      ),
    );

    if (seriesNumber >= 4) {
      const rank = 12 - seriesNumber;
      main.push(
        checkpoint(
          prefix,
          `checkpoint-${seriesNumber}`,
          seriesNumber * 5,
          last
            ? 'Confirm the gold and silver medal positions and resolve any tie before Final completion.'
            : `Confirm rank ${rank}, resolve any tie by a five-shot shoot-off, and retire only the confirmed lowest finalist.`,
          reference,
        ),
        step(
          prefix,
          `safety-${seriesNumber}`,
          'OFFICIAL',
          'CHECK',
          last
            ? 'Confirm every pistol is unloaded with magazine removed, action open, and safety flag inserted.'
            : 'Confirm the eliminated finalist has unloaded, removed the magazine, inserted a safety flag, and stepped back.',
          reference,
          { mode: 'MANUAL' },
        ),
      );
    }
  }

  main.push(...completionSteps(prefix, reference));
  return script(
    'ISSF-2026-02-25m-pistol-women-conformance-2',
    'Commands and Announcements for Finals 2026 — 25m Pistol Women',
    main,
    womenShootOffSteps(prefix, '6.17.5(h)'),
  );
}

/** Official February 2026 command order for the 25m Rapid Fire Pistol Men Final. */
export function buildIssf25mRapidFirePistolMenFinalCommandScript(): FinalCommandScriptCapability {
  const prefix = 'issf.2026.rfpm-final';
  const reference = '6.17.4';
  const main: RuleCommandScriptStep[] = [
    step(prefix, 'reporting', 'OFFICIAL', 'CHECK', 'Finalists must report to the Preparation Area.', '6.17.1.3', {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -1800,
    }),
    step(prefix, 'athletes-to-line', 'CRO', 'COMMAND', 'ATHLETES TO THE LINE', reference, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -690,
    }),
    step(
      prefix,
      'presentation',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Present the finalists in firing-point order, followed by the Jury Member-in-Charge and Chief Range Officer.',
      reference,
      { mode: 'MANUAL' },
    ),
    step(prefix, 'take-positions-1-4', 'CRO', 'COMMAND', 'FINALISTS 1, 2, 3 AND 4: TAKE YOUR POSITIONS', reference, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -485,
    }),
    step(prefix, 'preparation-1-4-start', 'CRO', 'COMMAND', 'PREPARATION BEGINS NOW', reference, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -475,
    }),
    step(prefix, 'preparation-1-4-end', 'CRO', 'COMMAND', 'END OF PREPARATION', reference, {
      mode: 'SCHEDULED_START_OFFSET',
      offsetSeconds: -415,
    }),
    withEffect(
      step(prefix, 'sighting-load-1-4', 'CRO', 'COMMAND', 'FOR THE SIGHTING SERIES ... LOAD', reference, {
        mode: 'SCHEDULED_START_OFFSET',
        offsetSeconds: -400,
      }),
      { type: 'LOAD', purpose: 'SIGHTING', participantSelection: 'ALL_ACTIVE' },
    ),
  ];

  const sightingGroups = [
    { label: 'Finalists with Start Numbers 1 and 3', suffix: '1-3', offsetSeconds: -370 },
    { label: 'Finalists with Start Numbers 2 and 4', suffix: '2-4', offsetSeconds: -330 },
    { label: 'Finalists with Start Numbers 5 and 7', suffix: '5-7', offsetSeconds: -155 },
    { label: 'Finalists with Start Numbers 6 and 8', suffix: '6-8', offsetSeconds: -115 },
  ] as const;
  for (const [index, group] of sightingGroups.entries()) {
    if (index === 2) {
      main.push(
        step(
          prefix,
          'take-positions-5-8',
          'CRO',
          'COMMAND',
          'FINALISTS 5, 6, 7 AND 8: TAKE YOUR POSITIONS',
          reference,
          { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: -280 },
        ),
        step(prefix, 'preparation-5-8-start', 'CRO', 'COMMAND', 'PREPARATION BEGINS NOW', reference, {
          mode: 'SCHEDULED_START_OFFSET',
          offsetSeconds: -260,
        }),
        step(prefix, 'preparation-5-8-end', 'CRO', 'COMMAND', 'END OF PREPARATION', reference, {
          mode: 'SCHEDULED_START_OFFSET',
          offsetSeconds: -200,
        }),
        withEffect(
          step(prefix, 'sighting-load-5-8', 'CRO', 'COMMAND', 'FOR THE SIGHTING SERIES ... LOAD', reference, {
            mode: 'SCHEDULED_START_OFFSET',
            offsetSeconds: -185,
          }),
          { type: 'LOAD', purpose: 'SIGHTING', participantSelection: 'ALL_ACTIVE' },
        ),
      );
    }
    main.push(
      selectedTimedStep({
        prefix,
        suffix: `sighting-${group.suffix}-ready`,
        text: `${group.label.toUpperCase()} ... READY`,
        ruleReference: reference,
        timing: { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: group.offsetSeconds },
        purpose: 'SIGHTING',
        programId: 'RFPM_FINAL_SIGHTING_4',
        target: target(0),
        participantCount: 2,
      }),
      step(prefix, `sighting-${group.suffix}-attention`, 'CRO', 'COMMAND', 'ATTENTION', reference, {
        mode: 'AFTER_PREVIOUS',
        delaySeconds: 20,
      }),
      step(prefix, `sighting-${group.suffix}-stop`, 'CRO', 'COMMAND', 'STOP', reference, {
        mode: 'TIME_OR_ALL_SHOTS',
        durationSeconds: 12,
        shotsPerParticipant: 5,
      }),
    );
  }

  main.push(
    step(
      prefix,
      'brief-explanation',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Give the brief explanation of the Final and confirm the targets and scoreboard are set to MATCH.',
      reference,
      { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: -75 },
    ),
  );

  const pairLabels = [
    'Start Numbers 1 and 3',
    'Start Numbers 2 and 4',
    'Start Numbers 5 and 7',
    'Start Numbers 6 and 8',
  ];
  for (let seriesIndex = 0; seriesIndex < 3; seriesIndex += 1) {
    for (let pairIndex = 0; pairIndex < pairLabels.length; pairIndex += 1) {
      const seriesNumber = seriesIndex + 1;
      const pairNumber = pairIndex + 1;
      main.push(
        selectedTimedStep({
          prefix,
          suffix: `series-${seriesNumber}-pair-${pairNumber}-ready`,
          text: `${pairLabels[pairIndex]!.toUpperCase()} ... READY`,
          ruleReference: reference,
          timing:
            seriesIndex === 0 && pairIndex === 0
              ? { mode: 'SCHEDULED_START_OFFSET', offsetSeconds: -20 }
              : { mode: 'MANUAL' },
          purpose: 'MATCH',
          programId: 'RFPM_FINAL_MATCH_4',
          target: target(seriesIndex),
          participantCount: 2,
        }),
        step(prefix, `series-${seriesNumber}-pair-${pairNumber}-attention`, 'CRO', 'COMMAND', 'ATTENTION', reference, {
          mode: 'AFTER_PREVIOUS',
          delaySeconds: 20,
        }),
        step(
          prefix,
          `series-${seriesNumber}-pair-${pairNumber}-report`,
          'CRO',
          'ANNOUNCEMENT',
          `Report the hits for ${pairLabels[pairIndex]}.`,
          reference,
          { mode: 'TIME_OR_ALL_SHOTS', durationSeconds: 12, shotsPerParticipant: 5 },
        ),
      );
    }
    main.push(
      step(
        prefix,
        `series-${seriesIndex + 1}-commentary`,
        'ANNOUNCER',
        'ANNOUNCEMENT',
        seriesIndex === 1
          ? 'Comment for 15-20 seconds on the ranking and explain that two finalists will be eliminated after the next series.'
          : 'Comment for 15-20 seconds on the current ranking and notable scores.',
        reference,
        { mode: 'MANUAL' },
      ),
    );
  }

  main.push(
    checkpoint(
      prefix,
      'checkpoint-15-rank-8',
      15,
      'Confirm rank 8; a tie is resolved by the lower Finals Start Number.',
      reference,
    ),
    checkpoint(
      prefix,
      'checkpoint-15-rank-7',
      15,
      'Confirm rank 7 after rank 8 is recorded; a tie is resolved by the lower Finals Start Number.',
      reference,
    ),
    step(
      prefix,
      'safety-15',
      'OFFICIAL',
      'CHECK',
      'Confirm both eliminated finalists have unloaded, removed magazines, inserted safety flags, and stepped back.',
      reference,
      { mode: 'MANUAL' },
    ),
  );

  for (let seriesIndex = 3; seriesIndex < 8; seriesIndex += 1) {
    const seriesNumber = seriesIndex + 1;
    const activeCount = 10 - seriesNumber;
    for (let firingOrder = 1; firingOrder <= activeCount; firingOrder += 1) {
      main.push(
        selectedTimedStep({
          prefix,
          suffix: `series-${seriesNumber}-individual-${firingOrder}-ready`,
          text: `NEXT ACTIVE FINALIST IN FINALS START NUMBER ORDER (${firingOrder}/${activeCount}) ... READY`,
          ruleReference: reference,
          timing: { mode: 'MANUAL' },
          purpose: 'MATCH',
          programId: 'RFPM_FINAL_MATCH_4',
          target: target(seriesIndex),
          participantCount: 1,
        }),
        step(
          prefix,
          `series-${seriesNumber}-individual-${firingOrder}-attention`,
          'CRO',
          'COMMAND',
          'ATTENTION',
          reference,
          {
            mode: 'AFTER_PREVIOUS',
            delaySeconds: 20,
          },
        ),
        step(
          prefix,
          `series-${seriesNumber}-individual-${firingOrder}-report`,
          'CRO',
          'ANNOUNCEMENT',
          'Report the finalist’s hits after the target system is ready.',
          reference,
          { mode: 'TIME_OR_ALL_SHOTS', durationSeconds: 12, shotsPerParticipant: 5 },
        ),
      );
    }
    const rank = 10 - seriesNumber;
    main.push(
      checkpoint(
        prefix,
        `checkpoint-${seriesNumber}`,
        seriesNumber * 5,
        seriesNumber === 8
          ? 'Confirm the gold and silver medal positions and resolve any tie before Final completion.'
          : `Confirm rank ${rank}, apply the prescribed tie rule, and retire only the confirmed lowest finalist.`,
        reference,
      ),
      step(
        prefix,
        `safety-${seriesNumber}`,
        'OFFICIAL',
        'CHECK',
        seriesNumber === 8
          ? 'Command UNLOAD and confirm every pistol is safe.'
          : 'Confirm the eliminated finalist has unloaded, removed the magazine, inserted a safety flag, and stepped back.',
        reference,
        { mode: 'MANUAL' },
      ),
    );
  }

  main.push(...completionSteps(prefix, reference));
  return script(
    'ISSF-2026-02-25m-rfpm-conformance-2',
    'Commands and Announcements for Finals 2026 — 25m Rapid Fire Pistol Men',
    main,
    rapidFireShootOffSteps(prefix, '6.17.4(k)'),
  );
}

function womenShootOffSteps(prefix: string, ruleReference: string): RuleCommandScriptStep[] {
  return [
    step(
      prefix,
      'shoot-off-announce',
      'CRO',
      'ANNOUNCEMENT',
      'Announce the family names and firing points of the tied finalists only.',
      ruleReference,
      { mode: 'MANUAL' },
    ),
    shootOffTimedStep({
      prefix,
      suffix: 'shoot-off-ready',
      text: 'FOR THE SHOOT-OFF SERIES ... READY',
      ruleReference,
      programId: 'P25_FINAL_SHOOT_OFF_RAPID_3_7',
      participantExecution: 'SIMULTANEOUS',
    }),
    withEffect(
      step(prefix, 'shoot-off-stop', 'CRO', 'COMMAND', 'STOP', ruleReference, {
        mode: 'TIME_OR_ALL_SHOTS',
        durationSeconds: 71,
        shotsPerParticipant: 5,
      }),
      { type: 'CLOSE_FIRING', purpose: 'SHOOT_OFF' },
    ),
    step(
      prefix,
      'shoot-off-commentary',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Comment on the tie-break situation for no more than ten seconds.',
      ruleReference,
      { mode: 'MANUAL' },
    ),
    withEffect(
      step(
        prefix,
        'shoot-off-checkpoint',
        'OFFICIAL',
        'CHECK',
        'Confirm whether the five-shot tie is broken; repeat this branch if it is not.',
        ruleReference,
        { mode: 'MANUAL' },
      ),
      { type: 'CHECKPOINT' },
    ),
  ];
}

function rapidFireShootOffSteps(prefix: string, ruleReference: string): RuleCommandScriptStep[] {
  return [
    step(
      prefix,
      'shoot-off-announce',
      'CRO',
      'ANNOUNCEMENT',
      'Announce the tied finalists; each fires separately in ascending Finals Start Number order.',
      ruleReference,
      { mode: 'MANUAL' },
    ),
    shootOffTimedStep({
      prefix,
      suffix: 'shoot-off-ready',
      text: 'FOR EACH TIED FINALIST IN FINALS START NUMBER ORDER: READY',
      ruleReference,
      programId: 'RFPM_FINAL_SHOOT_OFF_4',
      participantExecution: 'SEQUENTIAL',
      participantOrder: 'FINAL_START_NUMBER_ASCENDING',
    }),
    withEffect(step(prefix, 'shoot-off-stop', 'CRO', 'COMMAND', 'STOP', ruleReference, { mode: 'MANUAL' }), {
      type: 'CLOSE_FIRING',
      purpose: 'SHOOT_OFF',
    }),
    step(
      prefix,
      'shoot-off-commentary',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Comment on the tie-break situation for no more than ten seconds.',
      ruleReference,
      { mode: 'MANUAL' },
    ),
    withEffect(
      step(
        prefix,
        'shoot-off-checkpoint',
        'OFFICIAL',
        'CHECK',
        'Confirm whether the five-shot tie is broken; repeat this branch if it is not.',
        ruleReference,
        { mode: 'MANUAL' },
      ),
      { type: 'CHECKPOINT' },
    ),
  ];
}

function completionSteps(prefix: string, ruleReference: string): RuleCommandScriptStep[] {
  return [
    step(
      prefix,
      'completion-clearance',
      'OFFICIAL',
      'CHECK',
      'Confirm with the Control Room that all ties and protests are resolved and the current Final result list is approved.',
      ruleReference,
      { mode: 'MANUAL' },
    ),
    withEffect(
      step(prefix, 'declare-results', 'CRO', 'DECLARATION', 'RESULTS ARE FINAL', ruleReference, { mode: 'MANUAL' }),
      { type: 'DECLARE_RESULTS' },
    ),
    step(
      prefix,
      'medallist-presentation',
      'ANNOUNCER',
      'ANNOUNCEMENT',
      'Present the bronze, silver, and gold medallists by country and name.',
      ruleReference,
      { mode: 'MANUAL' },
    ),
  ];
}

function checkpoint(
  prefix: string,
  suffix: string,
  afterMatchShot: number,
  text: string,
  ruleReference: string,
): RuleCommandScriptStep {
  return withEffect(step(prefix, suffix, 'OFFICIAL', 'CHECK', text, ruleReference, { mode: 'MANUAL' }), {
    type: 'CHECKPOINT',
    afterMatchShot,
  });
}

function selectedTimedStep(
  input: Omit<Parameters<typeof timedStep>[0], 'participantSelection'> & { participantCount: number },
): RuleCommandScriptStep {
  return timedStep({
    ...input,
    participantSelection: 'OFFICIAL_SELECTED',
    requiredParticipantCount: input.participantCount,
  });
}

function timedStep(input: {
  prefix: string;
  suffix: string;
  text: string;
  ruleReference: string;
  timing: RuleCommandScriptStep['timing'];
  purpose: 'SIGHTING' | 'MATCH';
  programId: string;
  target: RuleCommandSeriesTarget;
  participantSelection: RuleCommandParticipantSelection;
  requiredParticipantCount?: number;
}): RuleCommandScriptStep {
  return withEffect(step(input.prefix, input.suffix, 'CRO', 'COMMAND', input.text, input.ruleReference, input.timing), {
    type: 'RUN_TIMED_TARGET',
    purpose: input.purpose,
    participantSelection: input.participantSelection,
    programId: input.programId,
    shotsPerParticipant: 5,
    target: input.target,
    ...(input.requiredParticipantCount !== undefined
      ? { requiredParticipantCount: input.requiredParticipantCount }
      : {}),
  });
}

function shootOffTimedStep(input: {
  prefix: string;
  suffix: string;
  text: string;
  ruleReference: string;
  programId: string;
  participantExecution: 'SIMULTANEOUS' | 'SEQUENTIAL';
  participantOrder?: 'FINAL_START_NUMBER_ASCENDING';
}): RuleCommandScriptStep {
  return withEffect(
    step(input.prefix, input.suffix, 'CRO', 'COMMAND', input.text, input.ruleReference, { mode: 'MANUAL' }),
    {
      type: 'RUN_TIMED_TARGET',
      purpose: 'SHOOT_OFF',
      participantSelection: 'TIED_ONLY',
      programId: input.programId,
      shotsPerParticipant: 5,
      participantExecution: input.participantExecution,
      ...(input.participantOrder ? { participantOrder: input.participantOrder } : {}),
    },
  );
}

function target(seriesIndex: number): RuleCommandSeriesTarget {
  return { stageId: FINAL_STAGE_ID, stageIndex: FINAL_STAGE_INDEX, seriesIndex };
}

function script(
  version: string,
  title: string,
  main: readonly RuleCommandScriptStep[],
  shootOff: readonly RuleCommandScriptStep[],
): FinalCommandScriptCapability {
  return {
    version,
    source: { organization: 'ISSF', title, version: 'February 2026' },
    main,
    shootOff,
  };
}

function step(
  prefix: string,
  suffix: string,
  actor: RuleCommandScriptStep['actor'],
  kind: RuleCommandScriptStep['kind'],
  text: string,
  ruleReference: string,
  timing: RuleCommandScriptStep['timing'],
): RuleCommandScriptStep {
  return { id: `${prefix}.${suffix}`, actor, kind, text, ruleReference, timing, effect: NO_EFFECT };
}

function withEffect<T extends RuleCommandScriptStep['effect']>(
  value: RuleCommandScriptStep,
  effect: T,
): RuleCommandScriptStep {
  return { ...value, effect };
}

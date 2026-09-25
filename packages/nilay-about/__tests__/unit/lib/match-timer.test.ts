import { describe, expect, it } from 'vitest';

import { buildProgram, clock, cuesBetween, stateAt } from '@/lib/match-timer';

describe('qualification', () => {
  it('runs 15 minutes of sighting, a 30 second pause and 75 minutes of match firing', () => {
    const program = buildProgram('air-qualification');
    expect(program.cues.map((cue) => [cue.at, cue.command])).toEqual([
      [0, 'PREPARATION AND SIGHTING TIME … START'],
      [870, '30 SECONDS'],
      [900, 'END OF PREPARATION AND SIGHTING … STOP'],
      [930, 'MATCH FIRING … START'],
      [930 + 65 * 60, '10 MINUTES REMAINING'],
      [930 + 70 * 60, '5 MINUTES REMAINING'],
      [930 + 75 * 60, 'STOP'],
    ]);
    // The Rule Book gives the times of the remaining-time announcements but not their words.
    expect(program.cues.filter((cue) => !cue.official).map((cue) => cue.command)).toEqual([
      '10 MINUTES REMAINING',
      '5 MINUTES REMAINING',
    ]);
  });

  it('takes 50 minutes prone and 90 or 105 minutes for three positions', () => {
    expect(buildProgram('prone-qualification').duration).toBe(930 + 50 * 60);
    expect(buildProgram('3p-qualification').duration).toBe(930 + 90 * 60);
    expect(buildProgram('3p-qualification', { finalGapSeconds: 20, outdoor: true, pistol: false }).duration).toBe(
      930 + 105 * 60,
    );
  });
});

describe('finals', () => {
  it('gives the 10 m final two 250 s series and fourteen 50 s single shots', () => {
    const program = buildProgram('air-final');
    const firingPhases = program.phases.slice(1);
    expect(firingPhases.map((phase) => phase.end - phase.start)).toEqual([250, 250, ...Array(14).fill(50)]);
    expect(program.cues.filter((cue) => cue.command === 'START')).toHaveLength(16);
    expect(program.cues.at(-1)!.command).toBe('STOP … UNLOAD');
    // Sighting starts 30 s after TAKE YOUR POSITIONS for rifle and 10 s for pistol, and lasts five minutes.
    expect(program.cues[1]!.at).toBe(30);
    expect(buildProgram('air-final', { finalGapSeconds: 20, outdoor: false, pistol: true }).cues[1]!.at).toBe(10);
    // The first series is loaded 60 s after sighting stops, and started 5 s after LOAD.
    const load = program.cues.find((cue) => cue.command.startsWith('FOR THE FIRST'))!;
    expect(load.at).toBe(30 + 300 + 60);
  });

  it('gives the 3 positions final 22 minutes for kneeling and prone with its warnings', () => {
    const program = buildProgram('3p-final');
    // 6.17.3 d: TAKE YOUR POSITIONS, and 30 s later five minutes of preparation and sighting.
    expect(program.cues.slice(0, 4).map((cue) => [cue.at, cue.command])).toEqual([
      [0, 'TAKE YOUR POSITIONS'],
      [30, 'FIVE MINUTES PREPARATION AND SIGHTING TIME … START'],
      [300, '30 SECONDS'],
      [330, 'STOP'],
    ]);
    expect(program.phases[0]).toMatchObject({ start: 30, end: 330 });
    const start = program.cues.find((cue) => cue.command === 'MATCH FIRING START')!.at;
    expect(program.cues.find((cue) => cue.command === 'FIVE MINUTES')!.at - start).toBe(17 * 60);
    expect(program.cues.find((cue) => cue.command === 'THIRTY SECONDS')!.at - start).toBe(21 * 60 + 30);
    expect(program.phases.filter((phase) => phase.end - phase.start === 50)).toHaveLength(5);
  });
});

describe('the clock', () => {
  it('says what is under way and what comes next', () => {
    const program = buildProgram('air-qualification');
    const during = stateAt(program, 100);
    expect(during.phase?.name.en).toBe('Preparation and sighting');
    expect(during.remaining).toBe(800);
    expect(during.next?.command).toBe('30 SECONDS');
    const pause = stateAt(program, 910);
    expect(pause.last?.command).toBe('END OF PREPARATION AND SIGHTING … STOP');
    expect(stateAt(program, program.duration).finished).toBe(true);
    expect(cuesBetween(program, 860, 900).map((cue) => cue.command)).toEqual([
      '30 SECONDS',
      'END OF PREPARATION AND SIGHTING … STOP',
    ]);
  });

  it('shows the time left rounded up', () => {
    expect(clock(900)).toBe('15:00');
    expect(clock(0.2)).toBe('0:01');
    expect(clock(4500)).toBe('1:15:00');
    expect(clock(-3)).toBe('0:00');
  });
});

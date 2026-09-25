/**
 * The commands and times of ISSF qualification and finals, as a timeline to practise against.
 *
 * Times and command wordings are from the ISSF Rule Book 2026 (Edition 2025, second print 07/2026,
 * effective 1 July 2026): 6.11.1 (preparation and sighting, match firing), 6.11.9 and 7.7.4 / 8.11
 * (match times with electronic targets), 6.17.2 (10m finals) and 6.17.3 (50m 3 positions final).
 * The Rule Book says the finals timings are guidelines and points to a separate ISSF document,
 * "Commands and Announcements for Finals", which has not been checked; the pauses it leaves open are
 * the reader's setting here. The wording of the remaining-time announcements in qualification is not
 * given either (6.11.1.2 e), so those are marked as this tool's wording.
 */

export type MatchProgramKey =
  'air-qualification' | 'prone-qualification' | '3p-qualification' | 'air-final' | '3p-final';

export interface Cue {
  /** Seconds from the start of the program. */
  at: number;
  /** The command as the Rule Book writes it, or this tool's wording where it gives none. */
  command: string;
  /** A Japanese rendering by this tool, for reading along. Not an official translation. */
  ja: string;
  /** False where the Rule Book gives the time but not the words. */
  official: boolean;
}

export interface Phase {
  start: number;
  end: number;
  name: { ja: string; en: string };
}

export interface MatchProgram {
  key: MatchProgramKey;
  cues: Cue[];
  phases: Phase[];
  duration: number;
}

export interface ProgramOptions {
  /** Pause between a STOP and the next LOAD in a final: the announcements the Rule Book leaves to its finals document. */
  finalGapSeconds: number;
  /** 50m 3 positions qualification is 1 h 30 min indoors and 1 h 45 min outdoors (Rule Book 6.11.9.2). */
  outdoor: boolean;
  /** 10m finals start sighting 30 s after TAKE YOUR POSITIONS for rifle, 10 s for pistol (6.17.2). */
  pistol: boolean;
}

export const DEFAULT_PROGRAM_OPTIONS: ProgramOptions = { finalGapSeconds: 20, outdoor: false, pistol: false };

const MINUTE = 60;

/** 15 minutes of preparation and sighting, a pause of about 30 s, then match firing (6.11.1.1–6.11.1.2). */
function qualification(key: MatchProgramKey, matchMinutes: number): MatchProgram {
  const sighting = 15 * MINUTE;
  const matchStart = sighting + 30;
  const end = matchStart + matchMinutes * MINUTE;
  const cues: Cue[] = [
    { at: 0, command: 'PREPARATION AND SIGHTING TIME … START', ja: '準備・試射時間…開始', official: true },
    { at: sighting - 30, command: '30 SECONDS', ja: '残り 30 秒', official: true },
    { at: sighting, command: 'END OF PREPARATION AND SIGHTING … STOP', ja: '準備・試射時間終了…やめ', official: true },
    { at: matchStart, command: 'MATCH FIRING … START', ja: '本射…開始', official: true },
    { at: end - 10 * MINUTE, command: '10 MINUTES REMAINING', ja: '残り 10 分', official: false },
    { at: end - 5 * MINUTE, command: '5 MINUTES REMAINING', ja: '残り 5 分', official: false },
    { at: end, command: 'STOP', ja: 'やめ', official: true },
  ];
  return {
    key,
    cues,
    phases: [
      { start: 0, end: sighting, name: { ja: '準備・試射', en: 'Preparation and sighting' } },
      { start: sighting, end: matchStart, name: { ja: '本射の準備', en: 'Targets reset' } },
      { start: matchStart, end, name: { ja: '本射', en: 'Match firing' } },
    ],
    duration: end,
  };
}

/** A LOAD, five seconds, START, the firing time and STOP, as the finals rules give for each series or shot. */
function firing(
  at: number,
  load: string,
  loadJa: string,
  seconds: number,
  cues: Cue[],
  phases: Phase[],
  name: Phase['name'],
) {
  cues.push({ at, command: load, ja: loadJa, official: true });
  cues.push({ at: at + 5, command: 'START', ja: '開始', official: true });
  cues.push({ at: at + 5 + seconds, command: 'STOP', ja: 'やめ', official: true });
  phases.push({ start: at + 5, end: at + 5 + seconds, name });
  return at + 5 + seconds;
}

function airFinal(options: ProgramOptions): MatchProgram {
  const cues: Cue[] = [{ at: 0, command: 'TAKE YOUR POSITIONS', ja: '位置につけ', official: true }];
  const phases: Phase[] = [];
  const sightingStart = options.pistol ? 10 : 30;
  const sightingEnd = sightingStart + 5 * MINUTE;
  cues.push({
    at: sightingStart,
    command: 'FIVE (5) MINUTES PREPARATION AND SIGHTING TIME … START',
    ja: '5 分間の準備・試射時間…開始',
    official: true,
  });
  cues.push({ at: sightingEnd - 30, command: '30 SECONDS', ja: '残り 30 秒', official: true });
  cues.push({ at: sightingEnd, command: 'STOP … UNLOAD', ja: 'やめ…脱包', official: true });
  phases.push({ start: sightingStart, end: sightingEnd, name: { ja: '準備・試射', en: 'Preparation and sighting' } });
  let time = firing(
    sightingEnd + 60,
    'FOR THE FIRST COMPETITION SERIES … LOAD',
    '第 1 競技シリーズ…装填',
    250,
    cues,
    phases,
    { ja: '第 1 シリーズ（5 発・250 秒）', en: 'Series 1 (5 shots, 250 s)' },
  );
  time = firing(
    time + options.finalGapSeconds,
    'FOR THE NEXT COMPETITION SERIES, LOAD',
    '次の競技シリーズ…装填',
    250,
    cues,
    phases,
    { ja: '第 2 シリーズ（5 発・250 秒）', en: 'Series 2 (5 shots, 250 s)' },
  );
  for (let shot = 11; shot <= 24; shot++)
    time = firing(
      time + options.finalGapSeconds,
      'FOR THE NEXT COMPETITION SHOT, LOAD',
      '次の競技弾…装填',
      50,
      cues,
      phases,
      { ja: `${shot} 発目（単発・50 秒）`, en: `Shot ${shot} (single, 50 s)` },
    );
  // The 24th shot ends with STOP … UNLOAD rather than a plain STOP.
  const last = cues.at(-1) as Cue;
  last.command = 'STOP … UNLOAD';
  last.ja = 'やめ…脱包';
  return { key: 'air-final', cues, phases, duration: time };
}

function threePositionFinal(options: ProgramOptions): MatchProgram {
  // TAKE YOUR POSITIONS, then 30 s of holding exercises in the kneeling position before the five
  // minutes of preparation and sighting start (6.17.3 d).
  const sightingStart = 30;
  const sightingEnd = sightingStart + 5 * MINUTE;
  const cues: Cue[] = [
    { at: 0, command: 'TAKE YOUR POSITIONS', ja: '位置につけ', official: true },
    {
      at: sightingStart,
      command: 'FIVE MINUTES PREPARATION AND SIGHTING TIME … START',
      ja: '5 分間の準備・試射時間…開始',
      official: true,
    },
    { at: sightingEnd - 30, command: '30 SECONDS', ja: '残り 30 秒', official: true },
    { at: sightingEnd, command: 'STOP', ja: 'やめ', official: true },
  ];
  const phases: Phase[] = [
    { start: sightingStart, end: sightingEnd, name: { ja: '準備・試射', en: 'Preparation and sighting' } },
  ];
  const announce = sightingEnd + options.finalGapSeconds;
  cues.push({
    at: announce,
    command:
      'FINALISTS HAVE TWENTY-TWO MINUTES TO FIRE TEN SHOTS IN EACH OF THE KNEELING AND PRONE POSITIONS AND PREPARE FOR THE STANDING POSITION',
    ja: '膝射と伏射それぞれ 10 発を撃ち、立射の準備をする時間は 22 分です',
    official: true,
  });
  const start = announce + 5;
  const stop = start + 22 * MINUTE;
  cues.push({ at: start, command: 'MATCH FIRING START', ja: '本射開始', official: true });
  cues.push({ at: start + 17 * MINUTE, command: 'FIVE MINUTES', ja: '残り 5 分', official: true });
  cues.push({ at: start + 21 * MINUTE + 30, command: 'THIRTY SECONDS', ja: '残り 30 秒', official: true });
  cues.push({ at: stop, command: 'STOP', ja: 'やめ', official: true });
  phases.push({
    start,
    end: stop,
    name: { ja: '膝射・伏射（各 10 発・22 分）', en: 'Kneeling and prone (10 each, 22 min)' },
  });
  let time = firing(stop + 30, 'FOR THE NEXT COMPETITION SERIES … LOAD', '次の競技シリーズ…装填', 250, cues, phases, {
    ja: '立射 第 1 シリーズ（5 発・250 秒）',
    en: 'Standing series 1 (5 shots, 250 s)',
  });
  time = firing(
    time + options.finalGapSeconds,
    'FOR THE NEXT COMPETITION SERIES … LOAD',
    '次の競技シリーズ…装填',
    250,
    cues,
    phases,
    {
      ja: '立射 第 2 シリーズ（5 発・250 秒）',
      en: 'Standing series 2 (5 shots, 250 s)',
    },
  );
  for (let shot = 31; shot <= 35; shot++)
    time = firing(
      time + options.finalGapSeconds,
      'FOR THE NEXT COMPETITION SHOT … LOAD',
      '次の競技弾…装填',
      50,
      cues,
      phases,
      {
        ja: `${shot} 発目（立射・単発・50 秒）`,
        en: `Shot ${shot} (standing, single, 50 s)`,
      },
    );
  const last = cues.at(-1) as Cue;
  last.command = 'STOP … UNLOAD';
  last.ja = 'やめ…脱包';
  return { key: '3p-final', cues, phases, duration: time };
}

export function buildProgram(key: MatchProgramKey, options: ProgramOptions = DEFAULT_PROGRAM_OPTIONS): MatchProgram {
  switch (key) {
    case 'air-qualification':
      // 60 shots in 75 minutes with electronic targets, men and women, rifle and pistol (6.11.9.1).
      return qualification(key, 75);
    case 'prone-qualification':
      // 60 shots in 50 minutes (6.11.9.3).
      return qualification(key, 50);
    case '3p-qualification':
      return qualification(key, options.outdoor ? 105 : 90);
    case 'air-final':
      return airFinal(options);
    case '3p-final':
      return threePositionFinal(options);
  }
}

export interface TimerState {
  /** The phase under way, or null between phases. */
  phase: Phase | null;
  /** Seconds left in the phase under way, or until the next cue between phases. */
  remaining: number;
  /** The last cue given, and the next one due. */
  last: Cue | null;
  next: Cue | null;
  finished: boolean;
}

export function stateAt(program: MatchProgram, elapsed: number): TimerState {
  const phase = program.phases.find((item) => elapsed >= item.start && elapsed < item.end) ?? null;
  const given = program.cues.filter((cue) => cue.at <= elapsed);
  const next = program.cues.find((cue) => cue.at > elapsed) ?? null;
  return {
    phase,
    remaining: phase ? phase.end - elapsed : next ? next.at - elapsed : 0,
    last: given.at(-1) ?? null,
    next,
    finished: elapsed >= program.duration,
  };
}

/** The cues that fall after `from` and at or before `to`, for a clock that ticks in steps. */
export function cuesBetween(program: MatchProgram, from: number, to: number): Cue[] {
  return program.cues.filter((cue) => cue.at > from && cue.at <= to);
}

/** Minutes and seconds, rounded up, as a range clock shows the time left. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds - 1e-9));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(rest).padStart(2, '0')}`;
}

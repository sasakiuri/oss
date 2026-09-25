import { describe, expect, it } from 'vitest';

import { readChronographFile, splitDelimited } from '@/lib/chrono-import';

const BOM = '\uFEFF';
const NNBSP = '\u202F';

/** The layout of a ShotView export from the iOS app in English (2026-09-24), shortened to three shots. */
const shotViewIos = [
  `${BOM}"105 hybrid 31.0gt"`,
  '#,SPEED (FPS),Δ AVG (FPS),KE (FT-LB),POWER FACTOR (KGR⋅FT/S),TIME,CLEAN BORE,COLD BORE,SHOT NOTES',
  `1, 2808.2, 13.9, , , 1:41:26${NNBSP}PM, , , "" `,
  `2, 2790.7, -3.6, , , 1:41:52${NNBSP}PM, , , "" `,
  `3, 2797.3, 3.0, , , 1:49:38${NNBSP}PM, , , "" `,
  '-,,,,,,',
  'AVERAGE SPEED,2794.3,,,,,,,',
  'STD DEV,8.5,,,,,,,',
  'SPREAD,31.7,,,,,,,',
  'SESSION NOTE,"",,,,,,,',
  '-,,,,,,',
  'DATE, "April 6, 2024 at 1:36 PM",,,,,',
  `All shots included in the calculations,,,,,,,${BOM}`,
].join('\n');

/** The layout of a ShotView export from the Android app in German: metres per second and decimal commas. */
const shotViewGerman = [
  'Marlin,.357, 15,3grs W296, 158,0 gr',
  '#,Tempo (MPS),Δ DURCHSCHNITT (MPS),KE (J),Leistungsfaktor (N⋅s),Zeit,Ölschuss,Erstschuss,Schussnotizen',
  '1,"488,3","14,2","1220,7","5,0",17:09:22,,,',
  '2,"470,1","-3,9","1130,2","4,8",17:09:40,,,',
  '-,,,,,,',
  'AVERAGE SPEED,"479,2",,,,,',
].join('\n');

/** The layout of an original LabRadar `SR#### Report.csv`, with its NUL padding and CRLF line ends. */
const labRadar = [
  'sep=;',
  'Device ID;LBR-0028391;;\u0000\u0000   ',
  '',
  'Series No;0004;;\u0000\u0000',
  'Total number of shots;0002;;',
  '',
  'Units velocity;fps;;\u0000',
  'Units distances;yd;;',
  '',
  'Stats - Average;2594.14;fps;',
  '',
  'Shot ID;V0;V1;V2;V3;V5;V10;Ke0;Ke1;Ke2;Ke3;Ke5;Ke10;PF1;Proj. Weight;Date;Time',
  '0001;2743;2741;2738;2736;2731;2719;2372;2368;2363;2359;2351;2330;389.22;142.00;06-24-2019;19:49:28;',
  '0002;2701;2699;2696;2694;2689;2677;2300;2296;2291;2288;2280;2259;383.54;142.00;06-24-2019;19:50:02;',
].join('\r\n');

describe('reading chronograph files', () => {
  it('splits quoted cells', () => {
    expect(splitDelimited('1,"488,3","a ""b""",', ',')).toEqual(['1', '488,3', 'a "b"', '']);
  });

  it('reads a ShotView export in feet per second', () => {
    expect(readChronographFile(shotViewIos)).toEqual({
      kind: 'ok',
      format: 'shotview',
      unit: 'fps',
      velocities: [2808.2, 2790.7, 2797.3],
      session: '105 hybrid 31.0gt',
    });
  });

  it('reads a ShotView export in another language, by its shape and unit', () => {
    expect(readChronographFile(shotViewGerman)).toMatchObject({
      kind: 'ok',
      unit: 'mps',
      velocities: [488.3, 470.1],
    });
  });

  it('reads the muzzle velocity column of a LabRadar report', () => {
    expect(readChronographFile(labRadar)).toEqual({
      kind: 'ok',
      format: 'labradar',
      unit: 'fps',
      velocities: [2743, 2701],
      session: 'SR0004',
    });
  });

  it('refuses a unit it has not seen and a file it does not know', () => {
    expect(readChronographFile(labRadar.replace('Units velocity;fps', 'Units velocity;m/s'))).toEqual({
      kind: 'error',
      problem: 'unit',
    });
    expect(readChronographFile('800\n805')).toEqual({ kind: 'error', problem: 'unknown-format' });
    expect(readChronographFile(shotViewIos.replace(/^\d, 2[^\n]*\n/gm, ''))).toEqual({
      kind: 'error',
      problem: 'no-shots',
    });
  });
});

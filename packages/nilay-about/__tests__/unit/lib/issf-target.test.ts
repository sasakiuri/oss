import { describe, expect, it } from 'vitest';

import { issfTarget, scoreShot, summariseCard } from '@/lib/issf-target';

const ar = issfTarget('AR10');
const ap = issfTarget('AP10');
const fr = issfTarget('FR50');
const pistol = issfTarget('P25');

describe('ISSF target dimensions', () => {
  it('matches the outside diameters of the Rule Book tables', () => {
    expect(ar.ringDiametersMm).toEqual([45.5, 40.5, 35.5, 30.5, 25.5, 20.5, 15.5, 10.5, 5.5, 0.5]);
    expect(ap.ringDiametersMm[0]).toBe(155.5);
    expect(ap.ringDiametersMm[9]).toBe(11.5);
    expect(fr.ringDiametersMm[0]).toBe(154.4);
    expect(fr.ringDiametersMm[9]).toBe(10.4);
    expect(pistol.ringDiametersMm).toEqual([500, 450, 400, 350, 300, 250, 200, 150, 100, 50]);
  });
});

describe('scoring a shot', () => {
  it('scores the higher ring when the hole touches its outer edge', () => {
    // Air rifle: the 9 ring's outer radius is 2.75 mm, the pellet's radius 2.25 mm.
    expect(scoreShot(ar, 5.0)!.ring).toBe(9);
    expect(scoreShot(ar, 5.0001)!.ring).toBe(8);
    // Ring 1 is 22.75 mm out: a hole touching it at 25 mm still scores 1, beyond is a miss.
    expect(scoreShot(ar, 25)!.ring).toBe(1);
    expect(scoreShot(ar, 25.01)).toEqual({ ring: 0, decimal: 0, innerTen: false });
  });

  it('divides each ring into tenths and stops at 10.9', () => {
    expect(scoreShot(ar, 0)!.decimal).toBe(10.9);
    expect(scoreShot(ar, 0.25)!.decimal).toBe(10.9);
    expect(scoreShot(ar, 0.26)!.decimal).toBe(10.8);
    expect(scoreShot(ar, 2.5)!.decimal).toBe(10);
    expect(scoreShot(ar, 2.51)!.decimal).toBe(9.9);
    expect(scoreShot(ar, 5)!.decimal).toBe(9);
    // The tenths never disagree with the whole ring.
    for (let distance = 0; distance < 25; distance += 0.037) {
      const score = scoreShot(ar, distance)!;
      expect(Math.floor(score.decimal!)).toBe(score.ring);
    }
    // 50 m rifle: the 10 ring reaches 5.2 + 2.8 = 8 mm, a full ring width.
    expect(scoreShot(fr, 8)!.decimal).toBe(10);
    expect(scoreShot(ap, 8)!.decimal).toBe(10);
    expect(scoreShot(pistol, 0)).toEqual({ ring: 10, decimal: null, innerTen: true });
  });

  it('finds inner tens by each target’s rule', () => {
    // Air rifle: the 0.5 mm dot has to be shot out, so the centre is within 2.0 mm.
    expect(scoreShot(ar, 2.0)!.innerTen).toBe(true);
    expect(scoreShot(ar, 2.01)!.innerTen).toBe(false);
    expect(scoreShot(ar, 2.01)!.ring).toBe(10);
    // Air pistol: touching the 5 mm inner ten ring, 2.5 + 2.25 mm.
    expect(scoreShot(ap, 4.75)!.innerTen).toBe(true);
    expect(scoreShot(ap, 4.76)!.innerTen).toBe(false);
    expect(scoreShot(fr, 5.3)!.innerTen).toBe(true);
    expect(scoreShot(pistol, 15.3)!.innerTen).toBe(true);
    expect(scoreShot(pistol, 15.31)!.innerTen).toBe(false);
  });

  it('scores the centre fire precision stage with the 9.65 mm gauge', () => {
    // ISSF Rules for Paper Target Scoring 1.4.1: Centre Fire Pistol events are gauged at 9.65 mm.
    const centreFire = issfTarget('CF25');
    expect(centreFire.ringDiametersMm).toEqual(pistol.ringDiametersMm);
    expect(centreFire.calibreMm).toBe(9.65);
    // 29.80 − 4.825 = 24.975 mm reaches the 25 mm radius of the 10 ring; the 5.6 mm hole does not.
    expect(scoreShot(centreFire, 29.8)!.ring).toBe(10);
    expect(scoreShot(pistol, 29.8)!.ring).toBe(9);
    expect(scoreShot(centreFire, 29.83)!.ring).toBe(9);
    // The inner ten ring (25 mm) is touched out to 12.5 + 4.825 mm.
    expect(scoreShot(centreFire, 17.325)!.innerTen).toBe(true);
    expect(scoreShot(centreFire, 17.33)!.innerTen).toBe(false);
  });

  it('refuses a distance that is not one', () => {
    expect(scoreShot(ar, Number.NaN)).toBeNull();
    expect(scoreShot(ar, -1)).toBeNull();
  });
});

describe('a card', () => {
  it('totals match shots in series of ten and leaves sighters out', () => {
    const shots = [
      { x: 0, y: 0, sighter: true },
      ...Array.from({ length: 12 }, () => ({ x: 0.3, y: 0, sighter: false })),
    ];
    const card = summariseCard(ar, shots, true);
    expect(card.sighters).toBe(1);
    expect(card.shots).toBe(12);
    expect(card.series.map((series) => [series.shots, series.total])).toEqual([
      [10, 108],
      [2, 21.6],
    ]);
    expect(card.total).toBe(129.6);
    expect(card.average).toBeCloseTo(10.8, 10);
    expect(card.innerTens).toBe(12);
    expect(summariseCard(ar, shots, false).total).toBe(120);
    expect(summariseCard(ar, [], true).average).toBeNull();
  });

  it('totals the 25 m pistol card in the ten-shot series the tie-break reads', () => {
    // 25 m precision is fired in series of five (Rule Book 8.7.6.4), but ties in 25 m events are
    // broken on ten-shot series (6.15.1 b), which is how results show a stage: three series of ten.
    const shots = Array.from({ length: 12 }, () => ({ x: 0, y: 0, sighter: false }));
    for (const target of [pistol, issfTarget('CF25')])
      expect(summariseCard(target, shots, false).series.map((series) => series.shots)).toEqual([10, 2]);
  });
});

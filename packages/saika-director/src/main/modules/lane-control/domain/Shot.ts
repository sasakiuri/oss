import { Score } from './Score';
import { ShotNumber } from './ShotNumber';

/**
 * Describes why a scoring slot contains its current value.
 *
 * Keeping the disposition on the shot-slot entry preserves the existing score
 * projection while allowing officiating workflows to distinguish a scored zero
 * from a miss assigned because no shot was fired in time.
 */
export type ShotDisposition = 'SCORED' | 'MISS';

export class Shot {
  private constructor(
    public readonly shotNumber: ShotNumber,
    public readonly score: Score,
    public readonly seriesNumber: number,
    public readonly disposition: ShotDisposition,
  ) {}

  static create(
    shotNumber: number,
    score: number,
    seriesNumber: number = 1,
    disposition: ShotDisposition = 'SCORED',
  ): Shot {
    const sn = ShotNumber.create(shotNumber);
    const sc = Score.create(score);
    if (disposition !== 'SCORED' && disposition !== 'MISS') throw new Error(`Invalid shot disposition: ${disposition}`);
    if (disposition === 'MISS' && !sc.isZero()) throw new Error('A missed shot slot must have a score of zero');
    return new Shot(sn, sc, seriesNumber, disposition);
  }

  static miss(shotNumber: number, seriesNumber: number = 1): Shot {
    return Shot.create(shotNumber, 0, seriesNumber, 'MISS');
  }

  get isValid(): boolean {
    return this.disposition === 'SCORED' && !this.score.isZero();
  }

  get isMiss(): boolean {
    return this.disposition === 'MISS';
  }

  withScore(newScore: number): Shot {
    const sc = Score.create(newScore);
    return new Shot(this.shotNumber, sc, this.seriesNumber, 'SCORED');
  }

  withShotNumber(newNumber: number, seriesNumber: number = this.seriesNumber): Shot {
    const sn = ShotNumber.create(newNumber);
    return new Shot(sn, this.score, seriesNumber, this.disposition);
  }
}

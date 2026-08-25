import { Score } from './Score';
import { ShotNumber } from './ShotNumber';

export class Shot {
  private constructor(
    public readonly shotNumber: ShotNumber,
    public readonly score: Score,
    public readonly seriesNumber: number,
  ) {}

  static create(shotNumber: number, score: number, seriesNumber: number = 1): Shot {
    const sn = ShotNumber.create(shotNumber);
    const sc = Score.create(score);
    return new Shot(sn, sc, seriesNumber);
  }

  get isValid(): boolean {
    return !this.score.isZero();
  }

  withScore(newScore: number): Shot {
    const sc = Score.create(newScore);
    return new Shot(this.shotNumber, sc, this.seriesNumber);
  }

  withShotNumber(newNumber: number, seriesNumber: number = this.seriesNumber): Shot {
    const sn = ShotNumber.create(newNumber);
    return new Shot(sn, this.score, seriesNumber);
  }
}

// Domain (used by tests)
export { FinalShootoff } from './domain/FinalShootoff';
export type { ShootoffShot } from './domain/FinalShootoff';

export type { ShootoffStarted, ShootoffShotAdded, ShootoffRoundCompleted, ShootoffResolved } from './domain/events';

// Module definition
export { shootoffModule } from './shootoff.module';
